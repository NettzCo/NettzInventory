"use server";

import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tieneModulo } from "@/lib/modules";
import { revalidatePath } from "next/cache";

async function requierePagos() {
  const { userId, profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "pagos")) {
    throw new Error("No tienes acceso al módulo de Pagos adelantados.");
  }
  return { userId, profile };
}

export interface SimParaPago {
  id: string;
  icc: string;
  clienteActual: string | null;
  planUnidad: string | null;
  planCantidad: number | null;
  tipoPlan: string | null;
  duracionMeses: number;
  vencimientoActual: string | null; // calculado, informativo
}

/** Busca una SIM por ICC con los datos necesarios para armar la línea del
 *  pago (cliente, plan, y una sugerencia de hasta cuándo queda renovada). */
export async function buscarSimParaPago(icc: string): Promise<{ sim: SimParaPago | null } | { error: string }> {
  try {
    const { profile } = await requierePagos();
    const iccLimpio = icc.trim();
    if (!iccLimpio) return { sim: null };

    const supabase = await createClient();
    const { data } = await supabase
      .from("sim_current_view")
      .select("id, icc, cliente_actual, plan_unidad, plan_cantidad, tipo_plan, duracion_meses, fecha_entrega")
      .eq("organization_id", profile.organization_id)
      .eq("icc", iccLimpio)
      .maybeSingle();

    if (!data) return { sim: null };

    const duracionMeses = data.duracion_meses ?? 12;
    let vencimientoActual: string | null = null;
    if (data.fecha_entrega) {
      const v = new Date(`${data.fecha_entrega}T00:00:00`);
      v.setMonth(v.getMonth() + duracionMeses);
      vencimientoActual = v.toISOString().slice(0, 10);
    }

    return {
      sim: {
        id: data.id,
        icc: data.icc,
        clienteActual: data.cliente_actual,
        planUnidad: data.plan_unidad,
        planCantidad: data.plan_cantidad,
        tipoPlan: data.tipo_plan,
        duracionMeses,
        vencimientoActual,
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo buscar la SIM." };
  }
}

export interface ItemPagoInput {
  icc: string;
  fechaRenovadoHasta: string; // AAAA-MM-DD
  valor: number;
}

export interface RegistrarPagoInput {
  clienteNombre: string;
  fechaPago: string;
  nota?: string;
  items: ItemPagoInput[];
}

async function generarNumeroComprobante(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string
): Promise<string> {
  const year = new Date().getFullYear();
  const prefijo = `ADEL-${year}-`;
  const { count } = await supabase
    .from("pagos_adelantados")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .like("numero_comprobante", `${prefijo}%`);
  const siguiente = (count ?? 0) + 1;
  return `${prefijo}${String(siguiente).padStart(4, "0")}`;
}

export async function registrarPago(input: RegistrarPagoInput) {
  try {
    const { userId, profile } = await requierePagos();

    if (!input.clienteNombre?.trim()) return { error: "Falta el nombre del cliente." };
    if (!input.fechaPago) return { error: "Falta la fecha de pago." };
    if (!input.items || input.items.length === 0) return { error: "Agrega al menos una SIM al pago." };
    for (const it of input.items) {
      if (!it.icc?.trim()) return { error: "Hay una fila sin ICC." };
      if (!it.fechaRenovadoHasta) return { error: `Falta la fecha de renovación para el ICC ${it.icc}.` };
      if (!Number.isFinite(it.valor) || it.valor < 0) return { error: `El valor para el ICC ${it.icc} no es válido.` };
    }

    const supabase = await createClient();

    // Buscar todas las SIM del pago de una sola vez.
    const iccs = input.items.map((i) => i.icc.trim());
    const { data: simsEncontradas } = await supabase
      .from("sim_current_view")
      .select("id, icc, duracion_meses")
      .eq("organization_id", profile.organization_id)
      .in("icc", iccs);

    const iccASim = new Map((simsEncontradas ?? []).map((s) => [s.icc, s]));
    const faltantes = iccs.filter((icc) => !iccASim.has(icc));
    if (faltantes.length > 0) {
      return { error: `No se encontraron estas SIM en el inventario: ${faltantes.join(", ")}` };
    }

    const valorTotal = input.items.reduce((acc, it) => acc + Number(it.valor), 0);
    const numeroComprobante = await generarNumeroComprobante(supabase, profile.organization_id);

    const { data: pago, error: errorPago } = await supabase
      .from("pagos_adelantados")
      .insert({
        organization_id: profile.organization_id,
        numero_comprobante: numeroComprobante,
        cliente_nombre: input.clienteNombre.trim(),
        fecha_pago: input.fechaPago,
        valor_total: valorTotal,
        nota: input.nota?.trim() || null,
        created_by: userId,
      })
      .select("id, numero_comprobante")
      .single();

    if (errorPago || !pago) return { error: `No se pudo crear el registro de pago: ${errorPago?.message}` };

    // Renovar cada SIM (como el botón "Renovar": mantiene cliente/plan, mueve
    // la fecha de entrega hacia adelante) y dejar la línea del pago.
    for (const it of input.items) {
      const simInfo = iccASim.get(it.icc.trim())!;
      const duracionMeses = simInfo.duracion_meses ?? 12;

      const { error: errorLinea } = await supabase.from("pagos_adelantados_sims").insert({
        pago_id: pago.id,
        sim_id: simInfo.id,
        fecha_renovado_hasta: it.fechaRenovadoHasta,
        valor: it.valor,
      });
      if (errorLinea) {
        await supabase.from("pagos_adelantados").delete().eq("id", pago.id);
        return { error: `No se pudo registrar la línea del ICC ${it.icc}: ${errorLinea.message}` };
      }

      // Fecha de entrega "hacia atrás" para que fecha_entrega + duración dé
      // exactamente la fecha hasta la que se renovó.
      const nuevaFechaEntrega = new Date(`${it.fechaRenovadoHasta}T00:00:00`);
      nuevaFechaEntrega.setMonth(nuevaFechaEntrega.getMonth() - duracionMeses);
      const nuevaFechaEntregaStr = nuevaFechaEntrega.toISOString().slice(0, 10);

      const { data: asignacionActual } = await supabase
        .from("sim_assignments")
        .select("*")
        .eq("sim_id", simInfo.id)
        .is("ended_at", null)
        .maybeSingle();

      if (asignacionActual) {
        await supabase.from("sim_assignments").update({ ended_at: new Date().toISOString() }).eq("sim_id", simInfo.id).is("ended_at", null);
        const { error: errorAsig } = await supabase.from("sim_assignments").insert({
          sim_id: simInfo.id,
          cliente_nombre: asignacionActual.cliente_nombre,
          plan_unidad: asignacionActual.plan_unidad,
          plan_cantidad: asignacionActual.plan_cantidad,
          tipo_plan: asignacionActual.tipo_plan,
          pago_momento: asignacionActual.pago_momento,
          duracion_meses: asignacionActual.duracion_meses,
          precio_cliente: asignacionActual.precio_cliente,
          comercial_id: asignacionActual.comercial_id,
          broker_id: asignacionActual.broker_id,
          fecha_entrega: nuevaFechaEntregaStr,
          created_by: userId,
        });
        if (errorAsig) {
          return { error: `Se registró el pago, pero no se pudo renovar la SIM ${it.icc}: ${errorAsig.message}. Complétalo a mano desde su hoja de vida.` };
        }
      }

      await supabase.from("sim_status_history").insert({
        sim_id: simInfo.id,
        estado: "Activa",
        changed_by: userId,
        nota: `Renovada por pago adelantado — comprobante ${numeroComprobante}, hasta ${it.fechaRenovadoHasta}.`,
      });
    }

    revalidatePath("/dashboard/pagos");
    revalidatePath("/dashboard/inventario");
    revalidatePath("/dashboard/alertas");
    return { ok: true, pagoId: pago.id, numeroComprobante: pago.numero_comprobante };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo registrar el pago." };
  }
}

/** Sube el comprobante que mandó el cliente (captura de transferencia,
 *  etc.) y lo asocia al pago ya creado. */
export async function subirComprobantePago(pagoId: string, formData: FormData) {
  try {
    const { profile } = await requierePagos();

    const supabase = await createClient();
    const { data: pago } = await supabase
      .from("pagos_adelantados")
      .select("id, organization_id")
      .eq("id", pagoId)
      .maybeSingle();
    if (!pago || pago.organization_id !== profile.organization_id) return { error: "No se encontró el pago." };

    const file = formData.get("file") as File | null;
    if (!file) return { error: "No se recibió ningún archivo." };
    if (file.size > 8 * 1024 * 1024) return { error: "El archivo no puede pesar más de 8 MB." };

    const extension = file.name.split(".").pop() || "bin";
    const ruta = `${profile.organization_id}/${pagoId}/${Date.now()}.${extension}`;

    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from("pagos-comprobantes")
      .upload(ruta, await file.arrayBuffer(), { contentType: file.type, upsert: true });
    if (uploadError) return { error: uploadError.message };

    const { data: urlData } = admin.storage.from("pagos-comprobantes").getPublicUrl(ruta);

    const { error: errorUpdate } = await supabase
      .from("pagos_adelantados")
      .update({ comprobante_archivo_url: urlData.publicUrl })
      .eq("id", pagoId);
    if (errorUpdate) return { error: errorUpdate.message };

    revalidatePath("/dashboard/pagos");
    return { ok: true, url: urlData.publicUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo subir el comprobante. Intenta de nuevo." };
  }
}

export interface FiltrosPagos {
  cliente?: string;
  icc?: string;
  fechaDesde?: string;
  fechaHasta?: string;
}

export interface PagoListado {
  id: string;
  numero_comprobante: string;
  cliente_nombre: string;
  fecha_pago: string;
  valor_total: number;
  comprobante_archivo_url: string | null;
  nota: string | null;
  creado_por_nombre: string | null;
  sims: { icc: string; fecha_renovado_hasta: string; valor: number }[];
}

export async function listarPagos(filtros: FiltrosPagos = {}): Promise<PagoListado[] | { error: string }> {
  try {
    const { profile } = await requierePagos();
    const supabase = await createClient();

    let query = supabase
      .from("pagos_adelantados")
      .select("id, numero_comprobante, cliente_nombre, fecha_pago, valor_total, comprobante_archivo_url, nota, created_by, profiles!pagos_adelantados_created_by_fkey(full_name)")
      .eq("organization_id", profile.organization_id)
      .order("fecha_pago", { ascending: false });

    if (filtros.cliente) query = query.ilike("cliente_nombre", `%${filtros.cliente}%`);
    if (filtros.fechaDesde) query = query.gte("fecha_pago", filtros.fechaDesde);
    if (filtros.fechaHasta) query = query.lte("fecha_pago", filtros.fechaHasta);

    const { data: pagos, error } = await query;
    if (error) return { error: error.message };

    const ids = (pagos ?? []).map((p) => p.id);
    const { data: lineas } = ids.length
      ? await supabase.from("pagos_adelantados_sims").select("pago_id, fecha_renovado_hasta, valor, sim_cards(icc)").in("pago_id", ids)
      : { data: [] };

    const lineasPorPago = new Map<string, { icc: string; fecha_renovado_hasta: string; valor: number }[]>();
    for (const l of lineas ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- el tipo generado por el join no refleja bien la forma real
      const simCard = l.sim_cards as any;
      const icc = Array.isArray(simCard) ? simCard[0]?.icc : simCard?.icc;
      const arr = lineasPorPago.get(l.pago_id) ?? [];
      arr.push({ icc: icc ?? "—", fecha_renovado_hasta: l.fecha_renovado_hasta, valor: Number(l.valor) });
      lineasPorPago.set(l.pago_id, arr);
    }

    let resultado: PagoListado[] = (pagos ?? []).map((p) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const creador = p.profiles as any;
      return {
        id: p.id,
        numero_comprobante: p.numero_comprobante,
        cliente_nombre: p.cliente_nombre,
        fecha_pago: p.fecha_pago,
        valor_total: Number(p.valor_total),
        comprobante_archivo_url: p.comprobante_archivo_url,
        nota: p.nota,
        creado_por_nombre: Array.isArray(creador) ? creador[0]?.full_name : creador?.full_name ?? null,
        sims: lineasPorPago.get(p.id) ?? [],
      };
    });

    if (filtros.icc) {
      const iccBuscado = filtros.icc.trim().toLowerCase();
      resultado = resultado.filter((p) => p.sims.some((s) => s.icc.toLowerCase().includes(iccBuscado)));
    }

    return resultado;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudieron cargar los pagos." };
  }
}

export interface PagoDetalle extends PagoListado {
  organization_id: string;
}

/** Trae un pago con todo el detalle necesario para generar el comprobante en PDF. */
export async function obtenerPagoParaComprobante(pagoId: string): Promise<PagoDetalle | { error: string }> {
  try {
    const { profile } = await requierePagos();
    const supabase = await createClient();

    const { data: pago } = await supabase
      .from("pagos_adelantados")
      .select("id, numero_comprobante, cliente_nombre, fecha_pago, valor_total, comprobante_archivo_url, nota, organization_id")
      .eq("id", pagoId)
      .maybeSingle();
    if (!pago || pago.organization_id !== profile.organization_id) return { error: "No se encontró el pago." };

    const { data: lineas } = await supabase
      .from("pagos_adelantados_sims")
      .select("fecha_renovado_hasta, valor, sim_cards(icc)")
      .eq("pago_id", pagoId);

    const sims = (lineas ?? []).map((l) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const simCard = l.sim_cards as any;
      const icc = Array.isArray(simCard) ? simCard[0]?.icc : simCard?.icc;
      return { icc: icc ?? "—", fecha_renovado_hasta: l.fecha_renovado_hasta, valor: Number(l.valor) };
    });

    return {
      id: pago.id,
      numero_comprobante: pago.numero_comprobante,
      cliente_nombre: pago.cliente_nombre,
      fecha_pago: pago.fecha_pago,
      valor_total: Number(pago.valor_total),
      comprobante_archivo_url: pago.comprobante_archivo_url,
      nota: pago.nota,
      creado_por_nombre: null,
      organization_id: pago.organization_id,
      sims,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo cargar el comprobante." };
  }
}
