import { createClient } from "@/lib/supabase/server";
import { llaveAlerta } from "@/lib/alerts";

/** Trae el conjunto de alertas que este usuario ya marcó como vistas. */
export async function obtenerAlertasVistas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<Set<string>> {
  const { data } = await supabase
    .from("sim_alert_reads")
    .select("sim_id, fecha_aniversario")
    .eq("user_id", userId);

  return new Set((data ?? []).map((r) => llaveAlerta(r.sim_id, `${r.fecha_aniversario}T00:00:00`)));
}
