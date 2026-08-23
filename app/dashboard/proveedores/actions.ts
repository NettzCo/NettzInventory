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

export async function crearProveedor(name: string) {
  const profile = await requireSuperAdmin();
  if (!name.trim()) return { error: "Ingresa el nombre del proveedor." };

  const supabase = await createClient();
  const { error } = await supabase.from("providers").insert({ name: name.trim(), organization_id: profile.organization_id });

  if (error) {
    return { error: error.code === "23505" ? "Ese proveedor ya existe." : error.message };
  }

  revalidatePath("/dashboard/configuracion");
  return { ok: true };
}

export async function actualizarProveedor(id: string, patch: { active?: boolean }) {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("providers").update(patch).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/configuracion");
  return { ok: true };
}

export async function eliminarProveedor(id: string) {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("providers").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/configuracion");
  return { ok: true };
}
