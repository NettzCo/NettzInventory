import { EstadoSim } from "./types";

export const ESTADO_COLOR: Record<EstadoSim, string> = {
  Inactiva: "var(--state-inactiva)",
  "Lista para activar": "var(--state-lista)",
  Activa: "var(--state-activa)",
  "Desactivada temporal": "var(--state-desactivada-temp)",
  Desactivada: "var(--state-desactivada)",
};

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

