"use server";

import { getCurrentProfile } from "@/lib/currentProfile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function requireSuperAdmin() {
  const { profile } = await getCurrentProfile();
  if (!profile.puede_gestionar_organizaciones) {
    throw new Error("Solo el super administrador de Nettz puede administrar organizaciones.");
  }
  return profile;
}

const ROLES_BASE = [
  { name: "Super administrador", is_system: true, default_modulos: ["inventario", "alertas", "clientes", "pedidos", "chat"] },
  { name: "Comercial", is_system: false, default_modulos: ["inventario", "alertas", "clientes", "pedidos", "chat"] },
  { name: "Broker", is_system: false, default_modulos: ["inventario", "alertas", "pedidos", "chat"] },
  { name: "Facturación", is_system: false, default_modulos: ["inventario", "alertas", "pedidos", "chat"] },
];

export async function crearOrganizacion(input: {
  name: string;
  colorInk: string;
  colorAccent: string;
  logoUrl: string;
  adminFullName: string;
  adminEmail: string;
  adminPassword: string;
}) {
  await requireSuperAdmin();

  if (!input.name.trim() || !input.adminFullName.trim() || !input.adminEmail.trim() || !input.adminPassword) {
    return { error: "Todos los campos son obligatorios (nombre de la organización y el primer administrador)." };
  }
  if (input.adminPassword.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const admin = createAdminClient();

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({
      name: input.name.trim(),
      logo_url: input.logoUrl || null,
      color_ink: input.colorInk,
      color_accent: input.colorAccent,
    })
    .select("id")
    .single();

  if (orgError) {
    return { error: orgError.code === "23505" ? "Ya existe una organización con ese nombre." : orgError.message };
  }

  const orgId = org.id as string;

  const { data: rolesCreados, error: rolesError } = await admin
    .from("roles")
    .insert(ROLES_BASE.map((r) => ({ organization_id: orgId, ...r })))
    .select("id, name");

  if (rolesError) {
    // Deshacemos la organización huérfana para que el nombre quede libre y se pueda reintentar.
    await admin.from("organizations").delete().eq("id", orgId);
    return { error: rolesError.message };
  }

  const superAdminRoleId = rolesCreados!.find((r) => r.name === "Super administrador")!.id;

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: input.adminEmail.trim(),
    password: input.adminPassword,
    email_confirm: true,
    user_metadata: { full_name: input.adminFullName.trim() },
  });

  if (authError) {
    await admin.from("organizations").delete().eq("id", orgId);
    return { error: authError.message };
  }

  await admin
    .from("profiles")
    .update({
      full_name: input.adminFullName.trim(),
      organization_id: orgId,
      role_id: superAdminRoleId,
      modulos: ROLES_BASE[0].default_modulos,
    })
    .eq("id", authUser.user!.id);

  const { profile: creador } = await getCurrentProfile();
  await admin.from("audit_log").insert({
    organization_id: orgId,
    user_id: creador.id,
    accion: "Creó esta organización",
    entidad: "Organizaciones",
    detalle: `${input.name.trim()} — administrador inicial: ${input.adminFullName.trim()}`,
  });

  revalidatePath("/dashboard/organizaciones");
  return { ok: true };
}

export async function actualizarOrganizacion(id: string, patch: { name?: string; color_ink?: string; color_accent?: string; logo_url?: string }) {
  const { profile } = await getCurrentProfile();
  await requireSuperAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("organizations").update(patch).eq("id", id);
  if (error) {
    return { error: error.code === "23505" ? "Ya existe una organización con ese nombre." : error.message };
  }

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    organization_id: id,
    user_id: profile.id,
    accion: "Editó los datos de esta organización",
    entidad: "Organizaciones",
    detalle: Object.keys(patch).join(", "),
  });

  revalidatePath("/dashboard/organizaciones");
  return { ok: true };
}
