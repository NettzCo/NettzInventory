import { EstadoSim } from "./types";

/** Suma meses a una fecha "YYYY-MM-DD" sin pasar nunca por un objeto Date
 *  con zona horaria (por eso nunca se corre un día según dónde se abra la
 *  página) — pura aritmética de calendario. Si el mes resultante no tiene
 *  ese día (ej. 31 de febrero), se ajusta al último día válido de ese mes,
 *  igual que hace date-fns.addMonths. */
export function sumarMeses(fechaIso: string, meses: number): string {
  const [y, m, d] = fechaIso.split("-").map(Number);
  const totalMeses = (m - 1) + meses;
  const nuevoAño = y + Math.floor(totalMeses / 12);
  const nuevoMes = ((totalMeses % 12) + 12) % 12; // 0-11
  // Truco seguro: el "día 0" de nuevoMes+1 es el último día de nuevoMes.
  // getDate()/setDate() con argumentos numéricos son puramente locales —
  // nunca se lee ni se escribe una hora, así que no hay zona horaria que
  // pueda desfasar el resultado.
  const diasEnNuevoMes = new Date(nuevoAño, nuevoMes + 1, 0).getDate();
  const nuevoDia = Math.min(d, diasEnNuevoMes);
  return `${nuevoAño}-${String(nuevoMes + 1).padStart(2, "0")}-${String(nuevoDia).padStart(2, "0")}`;
}

/** La fecha de hoy en formato "YYYY-MM-DD", en la zona horaria de quien
 *  esté ejecutando este código (servidor o navegador) — para comparar
 *  contra fechas de vencimiento sin mezclar UTC con hora local. */
export function hoyIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Días entre dos fechas "YYYY-MM-DD" (a - b) — positivo si a es
 *  posterior. Se calcula con Date.UTC en ambos lados por igual, así que
 *  nunca se mezcla con la hora local: es aritmética de calendario pura,
 *  nunca se corre un día sin importar la zona horaria de quien lo ejecute. */
export function diferenciaDiasIso(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const msPorDia = 24 * 60 * 60 * 1000;
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / msPorDia);
}

export const ESTADO_COLOR: Record<EstadoSim, string> = {
  Inactiva: "var(--state-inactiva)",
  "Lista para activar": "var(--state-lista)",
  Activa: "var(--state-activa)",
  "Sin número corto": "var(--state-sin-numero)",
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
  const vencimiento = sumarMeses(sim.fecha_entrega, sim.duracion_meses ?? 12);
  return vencimiento < hoyIso() ? "Vencida" : sim.estado_actual;
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

