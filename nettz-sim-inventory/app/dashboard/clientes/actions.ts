"use server";

import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { tieneModulo } from "@/lib/modules";

async function requireAccesoClientes() {
  const { userId, profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "clientes")) {
    throw new Error("No tienes permiso para gestionar clientes.");
  }
  return { userId, organizationId: profile.organization_id };
}

export interface ClienteInput {
  nombre: string;
  documento: string;
  telefono: string;
  correo: string;
  direccion: string;
  observaciones: string;
}

export async function crearCliente(input: ClienteInput) {
  const { userId, organizationId } = await requireAccesoClientes();
  if (!input.nombre.trim()) return { error: "El nombre del cliente es obligatorio." };

  const supabase = await createClient();
  const { error } = await supabase.from("clientes").insert({
    organization_id: organizationId,
    nombre: input.nombre.trim(),
    documento: input.documento?.trim() || null,
    telefono: input.telefono?.trim() || null,
    correo: input.correo?.trim() || null,
    direccion: input.direccion?.trim() || null,
    observaciones: input.observaciones?.trim() || null,
    created_by: userId,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/clientes");
  return { ok: true };
}

export async function actualizarCliente(id: string, patch: Partial<ClienteInput> & { active?: boolean }) {
  await requireAccesoClientes();
  const supabase = await createClient();

  if (patch.nombre !== undefined && !patch.nombre.trim()) {
    return { error: "El nombre no puede quedar vacío." };
  }

  const { error } = await supabase.from("clientes").update(patch).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/clientes");
  return { ok: true };
}

export async function eliminarCliente(id: string) {
  await requireAccesoClientes();
  const supabase = await createClient();

  const { error } = await supabase.from("clientes").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/clientes");
  return { ok: true };
}
