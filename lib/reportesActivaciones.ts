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

export async function construirReportesActivaciones(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  proveedoresIncluidos: string[]
): Promise<ReportesActivaciones> {
  const [{ data: historial }, { data: entregasRaw }] = await Promise.all([
    supabase
      .from("sim_status_history")
      .select("changed_at, estado, sim_cards!inner(proveedor, organization_id)")
      .eq("sim_cards.organization_id", organizationId)
      .in("estado", ["Activa", "Desactivada"]),
    supabase
      .from("sim_assignments")
      .select("fecha_entrega, sim_cards!inner(proveedor, organization_id)")
      .eq("sim_cards.organization_id", organizationId),
  ]);

  const filasActivacion: { fecha: string; proveedor: string }[] = [];
  const filasDesactivacion: { fecha: string; proveedor: string }[] = [];

  for (const h of (historial ?? []) as unknown as { changed_at: string; estado: string; sim_cards: SimCardMini }[]) {
    const item = { fecha: h.changed_at.slice(0, 10), proveedor: h.sim_cards?.proveedor ?? "—" };
    if (h.estado === "Activa") filasActivacion.push(item);
    else if (h.estado === "Desactivada") filasDesactivacion.push(item);
  }

  const filasEntregas = ((entregasRaw ?? []) as unknown as { fecha_entrega: string; sim_cards: SimCardMini }[]).map((e) => ({
    fecha: e.fecha_entrega,
    proveedor: e.sim_cards?.proveedor ?? "—",
  }));

  return {
    activaciones: agruparPorMes(filasActivacion, proveedoresIncluidos),
    desactivaciones: agruparPorMes(filasDesactivacion, proveedoresIncluidos),
    entregas: agruparPorMes(filasEntregas, proveedoresIncluidos),
  };
}
