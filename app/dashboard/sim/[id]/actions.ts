"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { revalidatePath } from "next/cache";
import { tieneModulo } from "@/lib/modules";
import { clasificarNumeroCorto, liberarYDesactivarOrigen } from "@/lib/numeroCortoSwap";

async function requireEditor() {
  const { userId, profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "inventario")) {
    throw new Error("No tienes permiso para modificar SIM cards.");
  }
  return { userId, profile };
}

export async function cambiarEstado(simId: string, estado: string, nota: string) {
  const { userId } = await requireEditor();
  const supabase = await createClient();

  if (!estado) return { error: "Selecciona un estado." };

  const { error } = await supabase.from("sim_status_history").insert({
    sim_id: simId,
    estado,
    changed_by: userId,
    nota: nota?.trim() || null,
  });

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/sim/${simId}`);
  return { ok: true };
}

/** Para que el panel pueda mostrar, mientras la persona escribe, a quién
 *  pertenece hoy ese número (o si es nuevo/está libre) — antes de guardar. */
export async function consultarNumeroCorto(simId: string, numeroCorto: string) {
  const { profile } = await requireEditor();
  const supabase = await createClient();

  const numero = numeroCorto?.trim();
  if (!numero) return { estadoOrigen: null };

  const clasificacion = await clasificarNumeroCorto(supabase, profile.organization_id, numero);
  if (clasificacion.estadoOrigen === "asignado" && clasificacion.simIdOrigen === simId) {
    return { estadoOrigen: "misma_sim" as const };
  }
  return clasificacion;
}

export async function asignarNumeroCorto(simId: string, numeroCorto: string) {
  const { userId, profile } = await requireEditor();
  const supabase = await createClient();

  const numero = numeroCorto?.trim();
  if (!numero) return { error: "Ingresa el nuevo número corto." };

  const { data: estaSim } = await supabase.from("sim_current_view").select("icc").eq("id", simId).maybeSingle();

  // Si ese número corto hoy es de OTRA SIM, se puede tomar sin importar en
  // qué estado esté — como efecto, esa otra SIM queda "Desactivada"
  // automáticamente (misma regla que el módulo de "Reasignar números").
  const origen = await clasificarNumeroCorto(supabase, profile.organization_id, numero);
  let aviso: string | null = null;
  if (origen.estadoOrigen === "asignado" && origen.simIdOrigen !== simId) {
    const { error: errorOrigen } = await liberarYDesactivarOrigen(supabase, userId, origen, numero, estaSim?.icc ?? simId);
    if (errorOrigen) return { error: errorOrigen };
    aviso = `El número ${numero} se le quitó al ICC ${origen.iccOrigen} (cliente: ${origen.clienteOrigen ?? "sin cliente"}), que quedó Desactivada.`;
  }

  const { error: closeError } = await supabase
    .from("sim_short_numbers")
    .update({ unassigned_at: new Date().toISOString() })
    .eq("sim_id", simId)
    .is("unassigned_at", null);

  if (closeError) return { error: closeError.message };

  const { error } = await supabase.from("sim_short_numbers").insert({
    sim_id: simId,
    organization_id: profile.organization_id,
    numero_corto: numero,
    assigned_by: userId,
  });

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/sim/${simId}`);
  if (origen.simIdOrigen) revalidatePath(`/dashboard/sim/${origen.simIdOrigen}`);
  return { ok: true, aviso };
}

export async function actualizarDetalles(simId: string, patch: { apn?: string | null; observaciones?: string | null }) {
  await requireEditor();
  const supabase = await createClient();

  const { error } = await supabase.from("sim_cards").update(patch).eq("id", simId);
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/sim/${simId}`);
  return { ok: true };
}

export interface ReasignacionInput {
  cliente_nombre: string;
  plan_unidad: string;
  plan_cantidad: string;
  tipo_plan: string;
  pago_momento: string;
  duracion_meses: string;
  precio_cliente: string;
  fecha_entrega: string;
  comercial_id: string;
  broker_id: string;
}

export async function reasignarCliente(simId: string, input: ReasignacionInput) {
  const { userId } = await requireEditor();
  const supabase = await createClient();

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
    return { error: "Faltan campos obligatorios de la reasignación." };
  }

  const { error: closeError } = await supabase
    .from("sim_assignments")
    .update({ ended_at: new Date().toISOString() })
    .eq("sim_id", simId)
    .is("ended_at", null);

  if (closeError) return { error: closeError.message };

  const { error } = await supabase.from("sim_assignments").insert({
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
  });

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/sim/${simId}`);
  return { ok: true };
}

/** Renueva una SIM vencida (o cualquier prepago): mantiene el mismo cliente,
 *  plan, precio y comercial — solo mueve la fecha de entrega hacia adelante,
 *  reiniciando el conteo del plazo desde esa fecha. */
export async function renovarSim(simId: string, nuevaFechaEntrega: string) {
  const { userId } = await requireEditor();
  const supabase = await createClient();

  if (!nuevaFechaEntrega) return { error: "Indica la nueva fecha de entrega." };

  const { data: asignacionActual, error: errorLectura } = await supabase
    .from("sim_assignments")
    .select("*")
    .eq("sim_id", simId)
    .is("ended_at", null)
    .maybeSingle();

  if (errorLectura) return { error: errorLectura.message };
  if (!asignacionActual) return { error: "Esta SIM no tiene un cliente/plan asignado — no hay nada que renovar. Usa \"Reasignar a otro cliente\" para asignarle uno." };

  const { error: closeError } = await supabase
    .from("sim_assignments")
    .update({ ended_at: new Date().toISOString() })
    .eq("sim_id", simId)
    .is("ended_at", null);
  if (closeError) return { error: closeError.message };

  const { error: errorInsert } = await supabase.from("sim_assignments").insert({
    sim_id: simId,
    cliente_nombre: asignacionActual.cliente_nombre,
    plan_unidad: asignacionActual.plan_unidad,
    plan_cantidad: asignacionActual.plan_cantidad,
    tipo_plan: asignacionActual.tipo_plan,
    pago_momento: asignacionActual.pago_momento,
    duracion_meses: asignacionActual.duracion_meses,
    precio_cliente: asignacionActual.precio_cliente,
    comercial_id: asignacionActual.comercial_id,
    broker_id: asignacionActual.broker_id,
    fecha_entrega: nuevaFechaEntrega,
    created_by: userId,
  });
  if (errorInsert) return { error: errorInsert.message };

  // Deja constancia en la hoja de vida, sin cambiar el estado (ya estaba
  // "Activa" — solo se corrió la fecha de vencimiento hacia adelante).
  await supabase.from("sim_status_history").insert({
    sim_id: simId,
    estado: "Activa",
    changed_by: userId,
    nota: `Renovada — nueva fecha de entrega: ${nuevaFechaEntrega}.`,
  });

  revalidatePath(`/dashboard/sim/${simId}`);
  revalidatePath("/dashboard/inventario");
  revalidatePath("/dashboard/alertas");
  return { ok: true };
}

/** Desactiva una SIM (por ejemplo, una vencida que no se va a renovar). */
export async function desactivarSim(simId: string, nota?: string) {
  const { userId } = await requireEditor();
  const supabase = await createClient();

  const { error } = await supabase.from("sim_status_history").insert({
    sim_id: simId,
    estado: "Desactivada",
    changed_by: userId,
    nota: nota?.trim() || "Desactivada manualmente.",
  });
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/sim/${simId}`);
  revalidatePath("/dashboard/inventario");
  revalidatePath("/dashboard/alertas");
  return { ok: true };
}
