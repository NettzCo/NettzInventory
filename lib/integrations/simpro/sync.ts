import { createAdminClient } from "@/lib/supabase/admin";
import { encontrarClienteSimilar } from "@/lib/textMatch";
import { listarTodasLasSims, obtenerDetallesSims, LOTE_DETALLES, SimproSimDetalle, SimproConfigError, SimproApiError } from "./client";
import { mapearEstadoSimpro } from "./estadoMapping";

export interface ResultadoSincronizacion {
  ok: boolean;
  errorGeneral?: string;
  resumen?: {
    total: number;
    creadas: number;
    actualizadas: number;
    sinCambios: number;
    errores: number;
    estadosSinMapear: string[];
  };
}

/**
 * Trae el inventario completo de SIMPro y lo refleja en Nettz:
 *  - SIM nueva (ICCID no existe en Nettz) → se crea con su hoja de vida
 *    inicial (estado, cliente si el grupo de SIMPro coincide con un cliente
 *    ya existente, IMEI, proveedor real según el MNO).
 *  - SIM ya existente → se actualiza el estado, el cliente y el número
 *    (MSISDN) si cambiaron, dejando el rastro en la hoja de vida como
 *    cualquier otro cambio.
 *
 * El "cliente" en Nettz se resuelve desde `sim_group.name` de SIMPro — si
 * ese nombre ya coincide (exacto o muy parecido) con un cliente existente
 * en Nettz, la SIM se asigna a ESE cliente en vez de crear uno nuevo, para
 * que un mismo cliente pueda tener SIM de Wireless Logic y de otros
 * proveedores conviviendo bajo el mismo nombre.
 */
export async function sincronizarSimpro(
  organizationId: string,
  disparadoPor: "manual" | "cron",
  userIdParaAuditoria: string,
  limite?: number
): Promise<ResultadoSincronizacion> {
  const supabase = createAdminClient();

  const { data: runInsert, error: errRun } = await supabase
    .from("simpro_sync_runs")
    .insert({ organization_id: organizationId, disparado_por: disparadoPor })
    .select("id")
    .single();
  if (errRun || !runInsert) {
    return { ok: false, errorGeneral: `No se pudo iniciar el registro de sincronización: ${errRun?.message}` };
  }
  const runId = runInsert.id as string;

  try {
    const listado = await listarTodasLasSims(undefined, limite);

    const [{ data: simsExistentes }, { data: asignacionesActuales }] = await Promise.all([
      supabase.from("sim_cards").select("id, icc").eq("organization_id", organizationId),
      supabase.from("sim_assignments").select("cliente_nombre").is("ended_at", null),
    ]);
    const iccAId = new Map((simsExistentes ?? []).map((s) => [s.icc, s.id as string]));
    const clientesExistentes = Array.from(new Set((asignacionesActuales ?? []).map((a) => a.cliente_nombre)));

    let creadas = 0;
    let actualizadas = 0;
    let sinCambios = 0;
    const erroresDetalle: { iccid: string; error: string }[] = [];
    const estadosSinMapear = new Set<string>();

    // /sims/details solo acepta un lote de ICCIDs por llamada.
    for (let i = 0; i < listado.length; i += LOTE_DETALLES) {
      const lote = listado.slice(i, i + LOTE_DETALLES).map((s) => s.iccid);
      let detalles: SimproSimDetalle[];
      try {
        detalles = await obtenerDetallesSims(lote);
      } catch (e) {
        for (const iccid of lote) erroresDetalle.push({ iccid, error: e instanceof Error ? e.message : "Error consultando el detalle" });
        continue;
      }

      for (const d of detalles) {
        try {
          const resultado = await procesarSim(supabase, organizationId, d, iccAId, clientesExistentes, userIdParaAuditoria);
          if (resultado === "creada") creadas++;
          else if (resultado === "actualizada") actualizadas++;
          else sinCambios++;
          if (resultado.estadoSinMapear) estadosSinMapear.add(resultado.estadoSinMapear);
        } catch (e) {
          erroresDetalle.push({ iccid: d.iccid, error: e instanceof Error ? e.message : "Error desconocido" });
        }
      }
    }

    await supabase
      .from("simpro_sync_runs")
      .update({
        finished_at: new Date().toISOString(),
        total_sims: listado.length,
        creadas,
        actualizadas,
        sin_cambios: sinCambios,
        errores: erroresDetalle.length,
        estados_sin_mapear: Array.from(estadosSinMapear),
        detalle_errores: erroresDetalle.slice(0, 200), // tope razonable para no inflar el registro
      })
      .eq("id", runId);

    return {
      ok: true,
      resumen: {
        total: listado.length,
        creadas,
        actualizadas,
        sinCambios,
        errores: erroresDetalle.length,
        estadosSinMapear: Array.from(estadosSinMapear),
      },
    };
  } catch (e) {
    const mensaje =
      e instanceof SimproConfigError ? e.message :
      e instanceof SimproApiError ? `Error de la API de SIMPro: ${e.message}` :
      e instanceof Error ? e.message : "Error desconocido";

    await supabase
      .from("simpro_sync_runs")
      .update({ finished_at: new Date().toISOString(), error_general: mensaje })
      .eq("id", runId);

    return { ok: false, errorGeneral: mensaje };
  }
}

type ResultadoFila = ("creada" | "actualizada" | "sin_cambios") & { estadoSinMapear?: string };

async function procesarSim(
  supabase: ReturnType<typeof createAdminClient>,
  organizationId: string,
  d: SimproSimDetalle,
  iccAId: Map<string, string>,
  clientesExistentes: string[],
  userId: string
): Promise<ResultadoFila> {
  const icc = d.iccid;
  const proveedor = d.mno_account?.mno?.name || d.mno_account?.name || "Wireless Logic";
  const msisdn = d.active_connection?.msisdn || "";
  const fechaActivacion = d.active_connection?.activation_date ? d.active_connection.activation_date.slice(0, 10) : null;
  const { estado, reconocido, valorOriginal } = mapearEstadoSimpro(
    d.active_connection?.customer_status?.ident,
    d.active_connection?.workflow_status?.ident
  );

  // El "grupo de SIM" en SIMPro es donde Nettz identificó que ya está el
  // nombre del cliente — si coincide (exacto o muy parecido) con un cliente
  // que ya existe en Nettz, se reutiliza ese nombre tal cual, para que el
  // mismo cliente pueda tener SIM de varios proveedores bajo un solo nombre.
  const clienteBruto = d.sim_group?.name?.trim() || "";
  const cliente = clienteBruto ? (encontrarClienteSimilar(clienteBruto, clientesExistentes) ?? clienteBruto) : "";

  const simId = iccAId.get(icc);

  if (!simId) {
    // SIM nueva para Nettz.
    const { data: nuevaSim, error: errSim } = await supabase
      .from("sim_cards")
      .insert({ organization_id: organizationId, icc, proveedor, imei: d.imei || null, created_by: userId })
      .select("id")
      .single();
    if (errSim || !nuevaSim) throw new Error(`No se pudo crear la SIM: ${errSim?.message}`);
    const nuevoId = nuevaSim.id as string;
    iccAId.set(icc, nuevoId);

    await supabase.from("sim_status_history").insert({
      sim_id: nuevoId,
      estado,
      changed_by: userId,
      nota: `Creada por sincronización con SIMPro (Wireless Logic).${!reconocido && valorOriginal ? ` Estado sin mapear: "${valorOriginal}" — se dejó como "${estado}", revísalo.` : ""}`,
      ...(fechaActivacion && estado === "Activa" ? { changed_at: new Date(fechaActivacion).toISOString() } : {}),
    });

    if (msisdn) {
      await supabase.from("sim_short_numbers").insert({ sim_id: nuevoId, organization_id: organizationId, numero_corto: msisdn, assigned_by: userId });
    }

    if (cliente) {
      await supabase.from("sim_assignments").insert({
        sim_id: nuevoId,
        cliente_nombre: cliente,
        plan_unidad: "Megas",
        plan_cantidad: 1, // SIMPro no expone la cantidad del plan por esta vía; se deja un valor mínimo válido y se debe completar a mano en "Cambio de estado".
        tipo_plan: "Postpago",
        pago_momento: "Mes vencido",
        precio_cliente: 0,
        comercial_id: userId,
        fecha_entrega: fechaActivacion || new Date().toISOString().slice(0, 10),
        created_by: userId,
      });
      if (!clientesExistentes.includes(cliente)) clientesExistentes.push(cliente);
    }

    return Object.assign("creada" as const, { estadoSinMapear: !reconocido && valorOriginal ? valorOriginal : undefined });
  }

  // SIM que ya existe en Nettz — se compara y solo se toca lo que cambió.
  let cambio = false;

  const [{ data: estadoActualRow }, { data: numeroActual }, { data: asigActual }] = await Promise.all([
    supabase.from("sim_status_history").select("estado").eq("sim_id", simId).order("changed_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("sim_short_numbers").select("numero_corto").eq("sim_id", simId).is("unassigned_at", null).maybeSingle(),
    supabase.from("sim_assignments").select("cliente_nombre").eq("sim_id", simId).is("ended_at", null).maybeSingle(),
  ]);

  if (estadoActualRow?.estado !== estado) {
    await supabase.from("sim_status_history").insert({
      sim_id: simId,
      estado,
      estado_anterior: estadoActualRow?.estado ?? null,
      changed_by: userId,
      nota: `Actualizado por sincronización con SIMPro.${!reconocido && valorOriginal ? ` Estado sin mapear: "${valorOriginal}".` : ""}`,
    });
    cambio = true;
  }

  if (msisdn && numeroActual?.numero_corto !== msisdn) {
    if (numeroActual) {
      await supabase.from("sim_short_numbers").update({ unassigned_at: new Date().toISOString() }).eq("sim_id", simId).is("unassigned_at", null);
    }
    await supabase.from("sim_short_numbers").insert({ sim_id: simId, organization_id: organizationId, numero_corto: msisdn, assigned_by: userId });
    cambio = true;
  }

  if (cliente && asigActual?.cliente_nombre !== cliente) {
    if (asigActual) {
      await supabase.from("sim_assignments").update({ ended_at: new Date().toISOString() }).eq("sim_id", simId).is("ended_at", null);
    }
    await supabase.from("sim_assignments").insert({
      sim_id: simId,
      cliente_nombre: cliente,
      plan_unidad: "Megas",
      plan_cantidad: 1, // SIMPro no expone la cantidad del plan por esta vía; se deja un valor mínimo válido y se debe completar a mano en "Cambio de estado".
      tipo_plan: "Postpago",
      pago_momento: "Mes vencido",
      precio_cliente: 0,
      comercial_id: userId,
      fecha_entrega: fechaActivacion || new Date().toISOString().slice(0, 10),
      created_by: userId,
    });
    if (!clientesExistentes.includes(cliente)) clientesExistentes.push(cliente);
    cambio = true;
  }

  if (d.imei) {
    await supabase.from("sim_cards").update({ imei: d.imei }).eq("id", simId).neq("imei", d.imei);
  }

  return Object.assign(cambio ? ("actualizada" as const) : ("sin_cambios" as const), {
    estadoSinMapear: !reconocido && valorOriginal ? valorOriginal : undefined,
  });
}
