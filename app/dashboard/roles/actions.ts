"use server";

import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function requireSuperAdmin() {
  const { profile } = await getCurrentProfile();
  if (!profile.role_es_sistema) {
    throw new Error("Solo un super administrador puede realizar esta acción.");
  }
  return profile;
}

export async function crearRol(input: { name: string; default_modulos: string[] }) {
  const profile = await requireSuperAdmin();
  if (!input.name.trim()) return { error: "Ingresa el nombre del rol." };

  const supabase = await createClient();
  const { error } = await supabase.from("roles").insert({
    organization_id: profile.organization_id,
    name: input.name.trim(),
    default_modulos: input.default_modulos,
  });

  if (error) {
    return { error: error.code === "23505" ? "Ya existe un rol con ese nombre." : error.message };
  }

  revalidatePath("/dashboard/configuracion");
  return { ok: true };
}

export async function actualizarRol(id: string, patch: { name?: string; default_modulos?: string[] }) {
  await requireSuperAdmin();
  const supabase = await createClient();

  const { data: rol } = await supabase.from("roles").select("is_system").eq("id", id).single();
  if (rol?.is_system && patch.name !== undefined) {
    return { error: "El rol del super administrador no se puede renombrar." };
  }
  if (patch.name !== undefined && !patch.name.trim()) {
    return { error: "El nombre no puede quedar vacío." };
  }

  const { error } = await supabase.from("roles").update(patch).eq("id", id);
  if (error) {
    return { error: error.code === "23505" ? "Ya existe un rol con ese nombre." : error.message };
  }

  revalidatePath("/dashboard/configuracion");
  return { ok: true };
}

export async function eliminarRol(id: string) {
  await requireSuperAdmin();
  const supabase = await createClient();

  const { data: rol } = await supabase.from("roles").select("is_system").eq("id", id).single();
  if (rol?.is_system) {
    return { error: "El rol del super administrador no se puede eliminar." };
  }

  const { error } = await supabase.from("roles").delete().eq("id", id);
  if (error) {
    // Restricción de llave foránea: hay usuarios con este rol asignado.
    return { error: "No puedes eliminar este rol porque hay usuarios asignados a él. Cámbiales el rol primero." };
  }

  revalidatePath("/dashboard/configuracion");
  return { ok: true };
}
