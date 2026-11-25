import { createClient } from "@/lib/supabase/server";

export interface FilaReporte {
  mes: string; // "2026-01"
  porProveedor: Record<string, number>;
  total: number;
}

interface SimCardMini {
  proveedor: string;
}

function nombreMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" });
}

function agruparPorMes(
  filas: { fecha: string; proveedor: string }[],
  proveedoresIncluidos: string[]
): FilaReporte[] {
  const mapa = new Map<string, Record<string, number>>();

  for (const f of filas) {
    if (proveedoresIncluidos.length > 0 && !proveedoresIncluidos.includes(f.proveedor)) continue;
    const mes = f.fecha.slice(0, 7); // "YYYY-MM"
    if (!mapa.has(mes)) mapa.set(mes, {});
    const fila = mapa.get(mes)!;
    fila[f.proveedor] = (fila[f.proveedor] ?? 0) + 1;
  }

  return Array.from(mapa.entries())
    .map(([mes, porProveedor]) => ({
      mes,
      porProveedor,
      total: Object.values(porProveedor).reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.mes.localeCompare(a.mes)); // más reciente primero
}

export { nombreMes };

export interface ReportesActivaciones {
  activaciones: FilaReporte[];
  desactivaciones: FilaReporte[];
  entregas: FilaReporte[];
}

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

// Supabase/PostgREST corta en silencio cualquier consulta a 1000 filas (sin
// ningún error). El historial de estados tiene muchas más, así que hay que
// traerlo por páginas; si no, el reporte se queda con 1000 filas cualquiera
// y los meses más recientes desaparecen. Se pide el total una vez y luego las
// páginas en grupos pequeños, con orden fijo para que no se repitan ni se salten filas.
async function traerTodo<T>(
  construir: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  contar: () => PromiseLike<{ count: number | null; error: { message: string } | null }>
): Promise<T[]> {
  const PAGINA = 1000;
  const SIMULTANEAS = 5;
  const { count, error: errorConteo } = await contar();
  if (errorConteo) throw new Error(errorConteo.message);
  const total = count ?? 0;
  const paginas = Math.ceil(total / PAGINA);
  const filas: T[] = [];
  for (let i = 0; i < paginas; i += SIMULTANEAS) {
    const grupo = await Promise.all(
      Array.from({ length: Math.min(SIMULTANEAS, paginas - i) }, (_, k) => construir((i + k) * PAGINA, (i + k + 1) * PAGINA - 1))
    );
    for (const r of grupo) {
      if (r.error) throw new Error(r.error.message);
      filas.push(...((r.data ?? []) as T[]));
    }
  }
  return filas;
}

// Día calendario en Colombia (UTC-5) de un instante: un cambio hecho a las
// 8 p. m. del último día del mes cuenta en ese mes, no en el siguiente.
function fechaColombia(iso: string): string {
  return new Date(new Date(iso).getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function construirReportesActivaciones(
  supabase: SupabaseServer,
  organizationId: string,
  proveedoresIncluidos: string[]
): Promise<ReportesActivaciones> {
  const ESTADOS = ["Activa", "Desactivada", "Desactivada por cartera"];

  const [historial, entregasRaw] = await Promise.all([
    traerTodo<{ changed_at: string; estado: string; sim_cards: SimCardMini }>(
      (desde, hasta) =>
        supabase
          .from("sim_status_history")
          .select("id, changed_at, estado, sim_cards!inner(proveedor, organization_id)")
          .eq("sim_cards.organization_id", organizationId)
          .in("estado", ESTADOS)
          .order("changed_at", { ascending: true })
          .order("id", { ascending: true })
          .range(desde, hasta),
      () =>
        supabase
          .from("sim_status_history")
          .select("id, sim_cards!inner(organization_id)", { count: "exact", head: true })
          .eq("sim_cards.organization_id", organizationId)
          .in("estado", ESTADOS)
    ),
    traerTodo<{ fecha_entrega: string; sim_cards: SimCardMini }>(
      (desde, hasta) =>
        supabase
          .from("sim_assignments")
          .select("id, fecha_entrega, sim_cards!inner(proveedor, organization_id)")
          .eq("sim_cards.organization_id", organizationId)
          .order("fecha_entrega", { ascending: true })
          .order("id", { ascending: true })
          .range(desde, hasta),
      () =>
        supabase
          .from("sim_assignments")
          .select("id, sim_cards!inner(organization_id)", { count: "exact", head: true })
          .eq("sim_cards.organization_id", organizationId)
    ),
  ]);

  const filasActivacion: { fecha: string; proveedor: string }[] = [];
  const filasDesactivacion: { fecha: string; proveedor: string }[] = [];

  for (const h of historial) {
    const item = { fecha: fechaColombia(h.changed_at), proveedor: h.sim_cards?.proveedor ?? "—" };
    if (h.estado === "Activa") filasActivacion.push(item);
    else if (h.estado === "Desactivada" || h.estado === "Desactivada por cartera") filasDesactivacion.push(item);
  }

  const filasEntregas = entregasRaw.map((e) => ({
    fecha: e.fecha_entrega,
    proveedor: e.sim_cards?.proveedor ?? "—",
  }));

  return {
    activaciones: agruparPorMes(filasActivacion, proveedoresIncluidos),
    desactivaciones: agruparPorMes(filasDesactivacion, proveedoresIncluidos),
    entregas: agruparPorMes(filasEntregas, proveedoresIncluidos),
  };
}
