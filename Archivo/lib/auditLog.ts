import { createClient } from "@/lib/supabase/server";

export async function registrarLog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  userId: string,
  accion: string,
  entidad: string,
  detalle?: string
) {
  await supabase.from("audit_log").insert({
    organization_id: organizationId,
    user_id: userId,
    accion,
    entidad,
    detalle: detalle ?? null,
  });
}
