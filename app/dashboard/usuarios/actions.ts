"use server";

import { getCurrentProfile } from "@/lib/currentProfile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function requireSuperAdmin() {
  const { profile } = await getCurrentProfile();
  if (!profile.role_es_sistema) {
    throw new Error("Solo un super administrador puede realizar esta acción.");
  }
  return profile;
}

async function requireMismaOrganizacion(profile: { organization_id: string }, targetUserId: string) {
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("organization_id").eq("id", targetUserId).maybeSingle();
  if (!target || target.organization_id !== profile.organization_id) {
    throw new Error("No puedes administrar usuarios de otra organización.");
  }
}

export async function crearUsuario(input: {
  full_name: string;
  email: string;
  password: string;
  role_id: string;
  modulos: string[];
}) {
  const profile = await requireSuperAdmin();

  if (!input.full_name.trim() || !input.email.trim() || !input.password || !input.role_id) {
    return { error: "Todos los campos son obligatorios." };
  }
  if (input.password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email.trim(),
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name.trim() },
  });

  if (error) return { error: error.message };

  // El trigger on_auth_user_created ya crea el perfil; aquí le asignamos su
  // organización (siempre la misma del super administrador que lo crea),
  // su rol y sus módulos reales elegidos en el formulario.
  await admin
    .from("profiles")
    .update({
      full_name: input.full_name.trim(),
      organization_id: profile.organization_id,
      role_id: input.role_id,
      modulos: input.modulos,
    })
    .eq("id", data.user!.id);

  revalidatePath("/dashboard/configuracion");
  return { ok: true };
}

export async function actualizarUsuario(id: string, patch: { role_id?: string; active?: boolean; full_name?: string; modulos?: string[] }) {
  const profile = await requireSuperAdmin();
  await requireMismaOrganizacion(profile, id);
  const supabase = await createClient();

  if (patch.full_name !== undefined && !patch.full_name.trim()) {
    return { error: "El nombre no puede quedar vacío." };
  }

  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/configuracion");
  return { ok: true };
}

export async function restablecerPassword(id: string, nuevaPassword: string) {
  const profile = await requireSuperAdmin();
  await requireMismaOrganizacion(profile, id);

  if (!nuevaPassword || nuevaPassword.length < 8) {
    return { error: "La nueva contraseña debe tener al menos 8 caracteres." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password: nuevaPassword });
  if (error) return { error: error.message };

  return { ok: true };
}

export async function eliminarUsuario(id: string) {
  const currentProfile = await requireSuperAdmin();

  if (id === currentProfile.id) {
    return { error: "No puedes eliminar tu propio usuario mientras estás conectado." };
  }
  await requireMismaOrganizacion(currentProfile, id);

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/configuracion");
  return { ok: true };
}

