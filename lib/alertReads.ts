import { createClient } from "@/lib/supabase/server";
import { llaveAlerta } from "@/lib/alerts";

/** Trae el conjunto de alertas que este usuario ya marcó como vistas.
 *  Pagina de a 1000: PostgREST corta en silencio en 1000 filas y, con
 *  muchas marcas acumuladas, la insignia nunca bajaba a cero. */
export async function obtenerAlertasVistas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<Set<string>> {
  const PAGINA = 1000;
  const vistas = new Set<string>();
  let desde = 0;
  while (true) {
    const { data } = await supabase
      .from("sim_alert_reads")
      .select("sim_id, fecha_aniversario")
      .eq("user_id", userId)
      .order("sim_id")
      .order("fecha_aniversario")
      .range(desde, desde + PAGINA - 1);
    if (!data || data.length === 0) break;
    for (const r of data) vistas.add(llaveAlerta(r.sim_id, `${r.fecha_aniversario}T00:00:00`));
    if (data.length < PAGINA) break;
    desde += PAGINA;
  }
  return vistas;
}
