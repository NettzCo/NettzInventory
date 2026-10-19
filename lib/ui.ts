import { EstadoSim } from "./types";

/** Fecha de HOY como string "YYYY-MM-DD", calculada en hora de Colombia
 *  (UTC-5), no en UTC. Usar SIEMPRE esto (nunca
 *  `new Date().toISOString().slice(0,10)`) para valores por defecto de
 *  "hoy": el servidor de Vercel corre en UTC, y entre las 7:00 p.m. y la
 *  medianoche hora Colombia, la fecha en UTC ya es el día siguiente —
 *  eso hacía que una SIM registrada hoy quedara guardada como de mañana. */
/** Convierte una fecha "pura" elegida por la persona (ej. "fecha de
 *  activación" en un formulario, formato "YYYY-MM-DD") en un timestamp
 *  para guardar en una columna de hora exacta (como sim_status_history.
 *  changed_at). Se ancla al MEDIODÍA hora Colombia (17:00 UTC) — ni a
 *  medianoche UTC ni a medianoche local — para que, sin importar en qué
 *  zona horaria se vuelva a mostrar después, nunca "cruce" al día
 *  anterior o siguiente. Si ya viene con hora (un datetime-local), se usa
 *  tal cual. */
export function fechaColombiaATimestamp(fecha: string): string {
  if (!fecha) return fecha;
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(fecha);
  return soloFecha ? `${fecha}T17:00:00.000Z` : new Date(fecha).toISOString();
}

/** Extrae "YYYY-MM-DD" de un Date calculado (p. ej. con addMonths a partir
 *  de `new Date(\`${fecha}T00:00:00\`)`), usando los componentes UTC. Esto
 *  es seguro sin importar si el Date se construyó en el servidor (que
 *  corre en UTC) o en el navegador de la persona (hora de Colombia,
 *  siempre detrás de UTC): extraer por UTC nunca retrocede al día
 *  anterior, que es justo el bug que se busca evitar. Usar esto en vez de
 *  `.toISOString()` cuando el resultado se va a guardar o a mostrar como
 *  fecha (no como timestamp exacto). */
export function fechaISODesdeDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function hoyColombia(): string {
  // Colombia no tiene horario de verano, siempre es UTC-5 todo el año.
  const ahoraUtc = Date.now();
  const colombia = new Date(ahoraUtc - 5 * 60 * 60 * 1000);
  return colombia.toISOString().slice(0, 10);
}

export const ESTADO_COLOR: Record<EstadoSim, string> = {
  Inactiva: "var(--state-inactiva)",
  "Lista para activar": "var(--state-lista)",
  Activa: "var(--state-activa)",
  "Desactivada temporal": "var(--state-desactivada-temp)",
  Desactivada: "var(--state-desactivada)",
  "Desactivada por cartera": "var(--state-desactivada-cartera)",
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
  // Las fechas "puras" (sin hora, tipo "2026-10-19", como fecha_entrega o
  // fecha_activacion) NO deben pasar por conversión de zona horaria: si se
  // hace `new Date("2026-10-19")`, JS la interpreta como medianoche UTC, y
  // al mostrarla en hora de Colombia (UTC-5) cae en las 7pm del día
  // ANTERIOR — la fecha se ve corrida un día hacia atrás. Para esas,
  // armamos la fecha a partir de los números directamente (hora local),
  // sin pasar por UTC. Los timestamps completos (con hora, como los de la
  // hoja de vida) sí se convierten normalmente.
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = soloFecha
    ? new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
    : new Date(iso);
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

