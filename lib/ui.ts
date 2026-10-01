import { EstadoSim } from "./types";

export const ESTADO_COLOR: Record<EstadoSim, string> = {
  Inactiva: "var(--state-inactiva)",
  "Lista para activar": "var(--state-lista)",
  Activa: "var(--state-activa)",
  "Desactivada temporal": "var(--state-desactivada-temp)",
  Desactivada: "var(--state-desactivada)",
  Vencida: "var(--state-vencida)",
};

/** Una SIM prepago "Activa" cuyo plazo (fecha_entrega + duración) ya pasó
 *  se muestra como "Vencida" — sin necesidad de que alguien la cambie de
 *  estado a mano. Esto es un cálculo de presentación: el estado guardado
 *  en la base de datos sigue siendo "Activa" hasta que alguien lo cambie
 *  explícitamente (por ejemplo, desactivándola desde Gestión de SIMs). */
export function estadoEfectivo(sim: {
  estado_actual: EstadoSim | null;
  tipo_plan: string | null;
  fecha_entrega: string | null;
  duracion_meses: number | null;
}): EstadoSim | null {
  if (sim.estado_actual !== "Activa" || sim.tipo_plan !== "Prepago" || !sim.fecha_entrega) {
    return sim.estado_actual;
  }
  const vencimiento = new Date(`${sim.fecha_entrega}T00:00:00`);
  vencimiento.setMonth(vencimiento.getMonth() + (sim.duracion_meses ?? 12));
  return vencimiento.getTime() < Date.now() ? "Vencida" : sim.estado_actual;
}

export function formatCodigoCliente(codigo: number): string {
  return `C-${String(codigo).padStart(5, "0")}`;
}

export function formatFecha(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatFechaHora(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatMoneda(valor: number | null | undefined) {
  if (valor === null || valor === undefined) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}

export function formatPlan(cantidad: number | null | undefined, unidad: string | null | undefined) {
  if (cantidad === null || cantidad === undefined || !unidad) return "—";
  return `${cantidad} ${unidad}`;
}

