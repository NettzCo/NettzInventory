"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ESTADOS_SIM, PLAN_UNIDADES, TIPOS_PLAN, PAGOS_MOMENTO } from "@/lib/types";
import { encontrarClienteSimilar } from "@/lib/textMatch";

export interface SimRowInput {
  icc: string;
  proveedor: string;
  numero_corto: string;
  estado_entrega: string;
  fecha_activacion: string; // solo relevante si estado_entrega === "Activa"; puede ser una fecha pasada
  apn: string;
  observaciones: string;
}

export interface EntregaInput {
  cliente_nombre: string;
  plan_unidad: string;
  plan_cantidad: string;
  tipo_plan: string;
  pago_momento: string;
  duracion_meses: string; // "" cuando no aplica (Postpago)
  precio_cliente: string;
  fecha_entrega: string;
  comercial_id: string;
  broker_id: string;
  sims: SimRowInput[];
}

export async function crearEntrega(input: EntregaInput) {
  const { userId, profile } = await getCurrentProfile();
  const supabase = await createClient();

  // Validaciones básicas de campos obligatorios
  if (
    !input.cliente_nombre?.trim() ||
    !input.plan_unidad ||
    !input.plan_cantidad ||
    !input.tipo_plan ||
    !input.pago_momento ||
    !input.precio_cliente ||
    !input.fecha_entrega ||
    !input.comercial_id
  ) {
    return { error: "Faltan campos obligatorios de la entrega." };
  }

  if (!input.sims.length) {
    return { error: "Agrega al menos una SIM card." };
  }

  for (const [i, sim] of input.sims.entries()) {
    if (!sim.icc?.trim() || !sim.proveedor?.trim() || !sim.estado_entrega) {
      return { error: `Falta información obligatoria en la SIM #${i + 1} (ICC, proveedor y estado son obligatorios).` };
    }
    if (sim.proveedor.trim().toLowerCase() === "claro" && !sim.numero_corto?.trim()) {
      return { error: `La SIM #${i + 1} es de Claro: el número corto es obligatorio.` };
    }
  }

  const createdIds: string[] = [];

  const { data: operacion, error: errorOperacion } = await supabase
    .from("bulk_operations")
    .insert({
      organization_id: profile.organization_id,
      tipo: "registro_entrega",
      cantidad_sims: input.sims.length,
      nota: `Entrega a ${input.cliente_nombre.trim()} (${input.sims.length} SIM)`,
      created_by: userId,
    })
    .select("id")
    .single();

  if (errorOperacion) {
    return { error: errorOperacion.message };
  }
  const operacionId = operacion.id as string;

  for (const sim of input.sims) {
    const { data: existente } = await supabase
      .from("sim_cards")
      .select("id")
      .eq("icc", sim.icc.trim())
      .maybeSingle();

    if (existente) {
      return {
        error: `La SIM con ICC ${sim.icc.trim()} ya existe en el inventario.`,
        existingSimId: existente.id,
        partialSuccess: createdIds.length > 0,
      };
    }

    const { data: simCard, error: simError } = await supabase
      .from("sim_cards")
      .insert({
        organization_id: profile.organization_id,
        icc: sim.icc.trim(),
        proveedor: sim.proveedor.trim(),
        apn: sim.apn?.trim() || null,
        observaciones: sim.observaciones?.trim() || null,
        created_by: userId,
      })
      .select("id")
      .single();

    if (simError) {
      return { error: simError.message, partialSuccess: createdIds.length > 0 };
    }

    const simId = simCard.id as string;
    createdIds.push(simId);

    const { error: errorEstado } = await supabase.from("sim_status_history").insert({
      sim_id: simId,
      estado: sim.estado_entrega,
      changed_by: userId,
      nota: "Estado inicial en la entrega.",
      bulk_operation_id: operacionId,
      // Si la SIM ya se registra como "Activa" y se indicó una fecha de
      // activación (por ejemplo, para cargar inventario histórico), se usa
      // esa fecha real en vez de la fecha de hoy — así las alertas de
      // vencimiento calculan bien desde el principio.
      ...(sim.estado_entrega === "Activa" && sim.fecha_activacion
        ? { changed_at: new Date(sim.fecha_activacion).toISOString() }
        : {}),
    });
    if (errorEstado) {
      await supabase.from("sim_cards").delete().eq("id", simId);
      return { error: `No se pudo registrar el estado de la SIM ${sim.icc}: ${errorEstado.message}`, partialSuccess: createdIds.length > 1 };
    }

    if (sim.numero_corto?.trim()) {
      const { error: errorNumero } = await supabase.from("sim_short_numbers").insert({
        sim_id: simId,
        numero_corto: sim.numero_corto.trim(),
        assigned_by: userId,
      });
      if (errorNumero) {
        await supabase.from("sim_cards").delete().eq("id", simId);
        return { error: `No se pudo registrar el número corto de la SIM ${sim.icc}: ${errorNumero.message}`, partialSuccess: createdIds.length > 1 };
      }
    }

    const { error: errorAsignacion } = await supabase.from("sim_assignments").insert({
      sim_id: simId,
      cliente_nombre: input.cliente_nombre.trim(),
      plan_unidad: input.plan_unidad,
      plan_cantidad: Number(input.plan_cantidad),
      tipo_plan: input.tipo_plan,
      pago_momento: input.pago_momento,
      duracion_meses: input.tipo_plan === "Prepago" ? Number(input.duracion_meses) || 12 : null,
      precio_cliente: Number(input.precio_cliente),
      comercial_id: input.comercial_id,
      broker_id: input.broker_id || null,
      fecha_entrega: input.fecha_entrega,
      created_by: userId,
      bulk_operation_id: operacionId,
    });
    if (errorAsignacion) {
      // No se deja la SIM a medias (con ICC pero sin cliente/plan) — se
      // revierte por completo para que el error sea visible de inmediato.
      await supabase.from("sim_cards").delete().eq("id", simId);
      return { error: `No se pudo asignar el cliente/plan a la SIM ${sim.icc}: ${errorAsignacion.message}`, partialSuccess: createdIds.length > 1 };
    }
  }

  redirect("/dashboard");
}

// ------------------------------------------------------------------
// CARGA MASIVA: cada fila del Excel es una entrega completa e
// independiente (puede ser de clientes distintos). Ver plantilla en
// /templates/plantilla-carga-masiva.xlsx
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// CARGA MASIVA: cada fila del Excel es una entrega completa. Si el ICC
// no existe, se crea. Si ya existe, se actualiza — cerrando los registros
// vigentes y abriendo unos nuevos, para que el cambio quede en la hoja
// de vida de esa SIM (nunca se sobreescribe el historial).
// Ver plantilla en /templates/plantilla-carga-masiva.xlsx
// ------------------------------------------------------------------

const COLUMNAS_ESPERADAS = [
  "icc", "proveedor", "numero_corto", "apn", "observaciones", "estado",
  "cliente_nombre", "plan_unidad", "plan_cantidad", "tipo_plan", "pago_momento",
  "precio_cliente", "fecha_entrega", "comercial_correo", "broker_correo",
];

export interface FilaParseada {
  fila: number;
  icc: string;
  proveedor: string;
  numeroCorto: string;
  apn: string;
  observaciones: string;
  estado: string;
  clienteEscrito: string;
  clienteSugerido: string | null;
  clienteResuelto: string; // el que realmente se va a guardar
  planUnidad: string;
  planCantidad: string;
  tipoPlan: string;
  pagoMomento: string;
  precio: string;
  fechaEntrega: string;
  comercialId: string;
  comercialNombre: string;
  brokerId: string;
  brokerNombre: string;
  esNueva: boolean;
  errores: string[];
}

async function extraerFilas(formData: FormData): Promise<{ error: string } | { filas: FilaParseada[] }> {
  const file = formData.get("archivo") as File | null;
  if (!file || file.size === 0) {
    return { error: "Selecciona un archivo Excel (.xlsx) para cargar." };
  }

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
  } catch {
    return { error: "No se pudo leer el archivo. Verifica que sea un .xlsx válido." };
  }

  const sheet = workbook.getWorksheet("Carga masiva") ?? workbook.worksheets[0];
  if (!sheet) return { error: "El archivo no tiene hojas de datos." };

  const headerRow = sheet.getRow(1).values as unknown[];
  const headers = headerRow.slice(1).map((h) => String(h ?? "").trim().toLowerCase());

  const missing = COLUMNAS_ESPERADAS.filter((c) => !headers.includes(c));
  if (missing.length) {
    return { error: `Faltan columnas en el archivo: ${missing.join(", ")}. Descarga la plantilla actualizada.` };
  }

  const { profile } = await getCurrentProfile();
  const supabase = await createClient();
  const [{ data: profiles }, { data: proveedoresActivos }, { data: apnsActivos }, { data: asignaciones }, { data: simsExistentes }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("organization_id", profile.organization_id).eq("active", true),
    supabase.from("providers").select("name").eq("active", true),
    supabase.from("apns").select("name").eq("active", true),
    supabase.from("sim_assignments").select("cliente_nombre"),
    supabase.from("sim_cards").select("icc").eq("organization_id", profile.organization_id),
  ]);

  const iccsExistentes = new Set((simsExistentes ?? []).map((s) => s.icc));

  const nombreToId = new Map<string, { id: string; full_name: string }>(
    (profiles ?? []).map((p) => [p.full_name.trim().toLowerCase(), { id: p.id, full_name: p.full_name }])
  );
  const proveedoresPorNombre = new Map<string, string>((proveedoresActivos ?? []).map((p) => [p.name.toLowerCase(), p.name]));
  const apnsPorNombre = new Map<string, string>((apnsActivos ?? []).map((a) => [a.name.toLowerCase(), a.name]));
  const clientesExistentes = Array.from(new Set((asignaciones ?? []).map((a) => a.cliente_nombre)));

  const filas: FilaParseada[] = [];
  const rowCount = sheet.rowCount;

  for (let r = 2; r <= rowCount; r++) {
    const row = sheet.getRow(r);
    const values = row.values as unknown[];
    if (!values || values.length <= 1) continue;

    const get = (col: string) => {
      const idx = headers.indexOf(col);
      if (idx === -1) return "";
      const v = values[idx + 1];
      return v === null || v === undefined ? "" : String(v).trim();
    };

    const icc = get("icc");
    if (!icc) continue;

    const proveedorEscrito = get("proveedor");
    const apnEscrito = get("apn");
    const numeroCorto = get("numero_corto");
    const observaciones = get("observaciones");
    const estado = get("estado");
    const clienteEscrito = get("cliente_nombre");
    const planUnidad = get("plan_unidad");
    const planCantidad = get("plan_cantidad");
    const tipoPlan = get("tipo_plan");
    const pagoMomento = get("pago_momento");
    const precio = get("precio_cliente");
    const fechaEntrega = get("fecha_entrega");
    const comercialEscrito = get("comercial_correo");
    const brokerEscrito = get("broker_correo");

    const errores: string[] = [];

    const proveedor = proveedoresPorNombre.get(proveedorEscrito.toLowerCase()) ?? proveedorEscrito;
    if (!proveedorEscrito) errores.push("proveedor es obligatorio");
    else if (!proveedoresPorNombre.has(proveedorEscrito.toLowerCase())) {
      errores.push(`proveedor "${proveedorEscrito}" no coincide con ningún proveedor activo`);
    }

    const apn = apnEscrito ? (apnsPorNombre.get(apnEscrito.toLowerCase()) ?? apnEscrito) : "";
    if (apnEscrito && !apnsPorNombre.has(apnEscrito.toLowerCase())) {
      errores.push(`apn "${apnEscrito}" no coincide con ningún APN activo`);
    }

    if (proveedor.toLowerCase() === "claro" && !numeroCorto) errores.push("numero_corto es obligatorio para Claro");
    if (!estado) errores.push("estado es obligatorio");
    else if (!ESTADOS_SIM.includes(estado as never)) errores.push(`estado "${estado}" no es válido`);
    if (!clienteEscrito) errores.push("cliente_nombre es obligatorio");
    if (!planUnidad) errores.push("plan_unidad es obligatorio");
    else if (!PLAN_UNIDADES.includes(planUnidad as never)) errores.push(`plan_unidad "${planUnidad}" no es válido`);
    if (!planCantidad) errores.push("plan_cantidad es obligatorio");
    else if (!Number.isFinite(Number(planCantidad))) errores.push(`plan_cantidad "${planCantidad}" debe ser un número (sin texto ni unidades)`);
    if (!tipoPlan) errores.push("tipo_plan es obligatorio");
    else if (!TIPOS_PLAN.includes(tipoPlan as never)) errores.push(`tipo_plan "${tipoPlan}" no es válido`);
    if (!pagoMomento) errores.push("pago_momento es obligatorio");
    else if (!PAGOS_MOMENTO.includes(pagoMomento as never)) errores.push(`pago_momento "${pagoMomento}" no es válido`);
    if (!precio) errores.push("precio_cliente es obligatorio");
    else if (!Number.isFinite(Number(precio))) errores.push(`precio_cliente "${precio}" debe ser un número (sin puntos ni símbolo de pesos)`);
    if (!fechaEntrega) errores.push("fecha_entrega es obligatorio");

    const comercial = nombreToId.get(comercialEscrito.toLowerCase());
    if (!comercialEscrito) errores.push("comercial_correo es obligatorio");
    else if (!comercial) errores.push(`comercial_correo "${comercialEscrito}" no coincide con ningún usuario activo`);

    const broker = brokerEscrito ? nombreToId.get(brokerEscrito.toLowerCase()) : undefined;
    if (brokerEscrito && !broker) errores.push(`broker_correo "${brokerEscrito}" no coincide con ningún usuario activo`);

    const clienteSugerido = clienteEscrito ? encontrarClienteSimilar(clienteEscrito, clientesExistentes) : null;
    const necesitaConfirmar = !!clienteSugerido && clienteSugerido !== clienteEscrito;

    filas.push({
      fila: r,
      icc,
      proveedor,
      numeroCorto,
      apn,
      observaciones,
      estado,
      clienteEscrito,
      clienteSugerido: necesitaConfirmar ? clienteSugerido : null,
      // Por defecto, si hay un cliente parecido, no se aplica solo hasta que el usuario confirme;
      // se guarda el nombre tal cual se escribió hasta que el usuario decida lo contrario.
      clienteResuelto: clienteEscrito,
      planUnidad,
      planCantidad,
      tipoPlan,
      pagoMomento,
      precio,
      fechaEntrega,
      comercialId: comercial?.id ?? "",
      comercialNombre: comercial?.full_name ?? comercialEscrito,
      brokerId: broker?.id ?? "",
      brokerNombre: broker?.full_name ?? brokerEscrito,
      esNueva: !iccsExistentes.has(icc),
      errores,
    });
  }

  return { filas };
}

/** FASE 1: lee y valida el archivo, detecta clientes parecidos, y NO guarda nada todavía. */
export async function analizarCargaMasiva(formData: FormData) {
  await getCurrentProfile();
  const resultado = await extraerFilas(formData);
  if ("error" in resultado) return { error: resultado.error };
  if (resultado.filas.length === 0) return { error: "El archivo no tiene filas con datos." };
  return { ok: true, filas: resultado.filas };
}

export interface FilaResultado {
  fila: number;
  icc: string;
  ok: boolean;
  accion?: "creada" | "actualizada" | "sin_cambios";
  error?: string;
}

/** FASE 2: guarda de verdad, ya con las decisiones del usuario sobre cada cliente ambiguo. */
export async function confirmarCargaMasiva(filas: FilaParseada[]) {
  const { userId, profile } = await getCurrentProfile();
  const supabase = await createClient();

  const { data: operacion, error: errorOperacion } = await supabase
    .from("bulk_operations")
    .insert({
      organization_id: profile.organization_id,
      tipo: "registro_entrega",
      cantidad_sims: 0, // se actualiza al final, con el conteo real de filas afectadas
      nota: `Carga masiva desde Excel (${filas.length} filas)`,
      created_by: userId,
    })
    .select("id")
    .single();

  if (errorOperacion) return { error: errorOperacion.message };
  const operacionId = operacion.id as string;

  const resultados: FilaResultado[] = [];
  let creadas = 0;
  let actualizadas = 0;
  let sinCambios = 0;

  for (const f of filas) {
    if (f.errores.length > 0) {
      resultados.push({ fila: f.fila, icc: f.icc, ok: false, error: f.errores.join("; ") });
      continue;
    }

    const cliente = f.clienteResuelto.trim();
    const { data: existente } = await supabase.from("sim_cards").select("id, apn, observaciones").eq("icc", f.icc).maybeSingle();

    if (!existente) {
      const { data: simCard, error: simError } = await supabase
        .from("sim_cards")
        .insert({ organization_id: profile.organization_id, icc: f.icc, proveedor: f.proveedor, apn: f.apn || null, observaciones: f.observaciones || null, created_by: userId })
        .select("id")
        .single();

      if (simError) {
        resultados.push({ fila: f.fila, icc: f.icc, ok: false, error: simError.message });
        continue;
      }

      const simId = simCard.id as string;

      const { error: errorEstado } = await supabase.from("sim_status_history").insert({ sim_id: simId, estado: f.estado, changed_by: userId, nota: "Estado inicial (carga masiva).", bulk_operation_id: operacionId });
      if (errorEstado) {
        await supabase.from("sim_cards").delete().eq("id", simId);
        resultados.push({ fila: f.fila, icc: f.icc, ok: false, error: `No se pudo registrar el estado: ${errorEstado.message}` });
        continue;
      }

      if (f.numeroCorto) {
        const { error: errorNumero } = await supabase.from("sim_short_numbers").insert({ sim_id: simId, numero_corto: f.numeroCorto, assigned_by: userId });
        if (errorNumero) {
          await supabase.from("sim_cards").delete().eq("id", simId);
          resultados.push({ fila: f.fila, icc: f.icc, ok: false, error: `No se pudo registrar el número corto: ${errorNumero.message}` });
          continue;
        }
      }

      const { error: errorAsignacion } = await supabase.from("sim_assignments").insert({
        sim_id: simId, cliente_nombre: cliente, plan_unidad: f.planUnidad, plan_cantidad: Number(f.planCantidad),
        tipo_plan: f.tipoPlan, pago_momento: f.pagoMomento, precio_cliente: Number(f.precio),
        comercial_id: f.comercialId, broker_id: f.brokerId || null, fecha_entrega: f.fechaEntrega, created_by: userId,
        bulk_operation_id: operacionId,
      });
      if (errorAsignacion) {
        // No se deja la SIM a medias (con ICC pero sin cliente/plan) — se
        // revierte por completo para que la fila quede claramente como
        // fallida y se pueda corregir y volver a cargar.
        await supabase.from("sim_cards").delete().eq("id", simId);
        resultados.push({ fila: f.fila, icc: f.icc, ok: false, error: `No se pudo asignar el cliente/plan: ${errorAsignacion.message}` });
        continue;
      }

      creadas++;
      resultados.push({ fila: f.fila, icc: f.icc, ok: true, accion: "creada" });
      continue;
    }

    const simId = existente.id as string;
    let cambio = false;

    const { data: statusActual } = await supabase
      .from("sim_status_history").select("estado").eq("sim_id", simId)
      .order("changed_at", { ascending: false }).limit(1).maybeSingle();
    if (!statusActual || statusActual.estado !== f.estado) {
      const { error: errorEstado } = await supabase.from("sim_status_history").insert({
        sim_id: simId, estado: f.estado, changed_by: userId, nota: "Actualizado por carga masiva.",
        estado_anterior: statusActual?.estado ?? null, bulk_operation_id: operacionId,
      });
      if (errorEstado) {
        resultados.push({ fila: f.fila, icc: f.icc, ok: false, error: `No se pudo actualizar el estado: ${errorEstado.message}` });
        continue;
      }
      cambio = true;
    }

    if (f.numeroCorto) {
      const { data: numeroActual } = await supabase
        .from("sim_short_numbers").select("numero_corto").eq("sim_id", simId).is("unassigned_at", null).maybeSingle();
      if (!numeroActual || numeroActual.numero_corto !== f.numeroCorto) {
        await supabase.from("sim_short_numbers").update({ unassigned_at: new Date().toISOString() }).eq("sim_id", simId).is("unassigned_at", null);
        const { error: errorNumero } = await supabase.from("sim_short_numbers").insert({ sim_id: simId, numero_corto: f.numeroCorto, assigned_by: userId });
        if (errorNumero) {
          resultados.push({ fila: f.fila, icc: f.icc, ok: false, error: `No se pudo actualizar el número corto: ${errorNumero.message}` });
          continue;
        }
        cambio = true;
      }
    }

    const { data: asigActual } = await supabase.from("sim_assignments").select("*").eq("sim_id", simId).is("ended_at", null).maybeSingle();
    const asigCambio = !asigActual
      || asigActual.cliente_nombre !== cliente
      || asigActual.plan_unidad !== f.planUnidad
      || Number(asigActual.plan_cantidad) !== Number(f.planCantidad)
      || asigActual.tipo_plan !== f.tipoPlan
      || asigActual.pago_momento !== f.pagoMomento
      || Number(asigActual.precio_cliente) !== Number(f.precio)
      || asigActual.comercial_id !== f.comercialId
      || (asigActual.broker_id || null) !== (f.brokerId || null)
      || asigActual.fecha_entrega !== f.fechaEntrega;

    if (asigCambio) {
      if (asigActual) {
        await supabase.from("sim_assignments").update({ ended_at: new Date().toISOString(), ended_by_bulk_operation_id: operacionId }).eq("sim_id", simId).is("ended_at", null);
      }
      const { error: errorAsignacion } = await supabase.from("sim_assignments").insert({
        sim_id: simId, cliente_nombre: cliente, plan_unidad: f.planUnidad, plan_cantidad: Number(f.planCantidad),
        tipo_plan: f.tipoPlan, pago_momento: f.pagoMomento, precio_cliente: Number(f.precio),
        comercial_id: f.comercialId, broker_id: f.brokerId || null, fecha_entrega: f.fechaEntrega, created_by: userId,
        bulk_operation_id: operacionId,
      });
      if (errorAsignacion) {
        resultados.push({ fila: f.fila, icc: f.icc, ok: false, error: `No se pudo asignar el cliente/plan: ${errorAsignacion.message}` });
        continue;
      }
      cambio = true;
    }

    const nuevoApn = f.apn || null;
    const nuevaObs = f.observaciones || null;
    if (nuevoApn !== (existente.apn ?? null) || nuevaObs !== (existente.observaciones ?? null)) {
      await supabase.from("sim_cards").update({ apn: nuevoApn, observaciones: nuevaObs }).eq("id", simId);
      cambio = true;
    }

    if (cambio) { actualizadas++; resultados.push({ fila: f.fila, icc: f.icc, ok: true, accion: "actualizada" }); }
    else { sinCambios++; resultados.push({ fila: f.fila, icc: f.icc, ok: true, accion: "sin_cambios" }); }
  }

  await supabase.from("bulk_operations").update({ cantidad_sims: creadas + actualizadas }).eq("id", operacionId);

  revalidatePath("/dashboard"); revalidatePath("/dashboard/inventario"); revalidatePath("/dashboard/nueva");
  return { ok: true, creadas, actualizadas, sinCambios, resultados };
}
