"use server";

import { getCurrentProfile } from "@/lib/currentProfile";
import { esSuperAdmin } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { sincronizarSimpro } from "@/lib/integrations/simpro/sync";
import { revalidatePath } from "next/cache";

/** Solo el super administrador puede disparar o revisar la integración —
 *  las credenciales de SIMPro son un secreto a nivel de toda la cuenta. */
async function requireSuperAdmin() {
  const { userId, profile } = await getCurrentProfile();
  if (!esSuperAdmin(profile)) throw new Error("Solo el super administrador puede gestionar integraciones.");
  return { userId, profile };
}

export async function sincronizarSimproManual(limite?: number) {
  const { userId, profile } = await requireSuperAdmin();
  const resultado = await sincronizarSimpro(profile.organization_id, "manual", userId, limite);
  revalidatePath("/dashboard/configuracion");
  revalidatePath("/dashboard/inventario");
  return resultado;
}

export interface SimproSyncRunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  disparado_por: string;
  total_sims: number;
  creadas: number;
  actualizadas: number;
  sin_cambios: number;
  errores: number;
  estados_sin_mapear: string[];
  error_general: string | null;
}

export async function obtenerHistorialSimpro(): Promise<SimproSyncRunRow[]> {
  const { profile } = await requireSuperAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("simpro_sync_runs")
    .select("id, started_at, finished_at, disparado_por, total_sims, creadas, actualizadas, sin_cambios, errores, estados_sin_mapear, error_general")
    .eq("organization_id", profile.organization_id)
    .order("started_at", { ascending: false })
    .limit(10);
  return (data ?? []) as SimproSyncRunRow[];
}
