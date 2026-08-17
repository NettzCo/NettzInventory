"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { revalidatePath } from "next/cache";
import { tieneModulo } from "@/lib/modules";

async function requireEditor() {
  const { userId, profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "inventario")) {
    throw new Error("No tienes permiso para modificar SIM cards.");
  }
  return userId;
}

export async function cambiarEstado(simId: string, estado: string, nota: string) {
  const userId = await requireEditor();
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

export async function asignarNumeroCorto(simId: string, numeroCorto: string) {
  const userId = await requireEditor();
  const supabase = await createClient();

  if (!numeroCorto?.trim()) return { error: "Ingresa el nuevo número corto." };

  const { error: closeError } = await supabase
    .from("sim_short_numbers")
    .update({ unassigned_at: new Date().toISOString() })
    .eq("sim_id", simId)
    .is("unassigned_at", null);

  if (closeError) return { error: closeError.message };

  const { error } = await supabase.from("sim_short_numbers").insert({
    sim_id: simId,
    numero_corto: numeroCorto.trim(),
    assigned_by: userId,
  });

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/sim/${simId}`);
  return { ok: true };
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
  precio_cliente: string;
  fecha_entrega: string;
  comercial_id: string;
  broker_id: string;
}

export async function reasignarCliente(simId: string, input: ReasignacionInput) {
  const userId = await requireEditor();
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
