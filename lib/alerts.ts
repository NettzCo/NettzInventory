import { addMonths, differenceInCalendarDays } from "date-fns";
import { SimCurrentView, EstadoSim } from "./types";

// Días antes del aniversario en que empieza a mostrarse la alerta.
export const DIAS_ALERTA_DEFAULT = 30;

// Por defecto, el módulo de alertas solo muestra SIM actualmente activas.
// El usuario puede ampliar el filtro a otros estados desde la página.
export const ESTADOS_ALERTA_DEFAULT: EstadoSim[] = ["Activa", "Vencida"];

export interface AlertaVencimiento {
  sim: SimCurrentView;
  fechaActivacion: string;
  fechaAniversario: string;
  diasRestantes: number; // negativo = ya vencido
}

export interface FiltrosAlertas {
  estados?: EstadoSim[]; // si se omite, solo "Activa"
  proveedor?: string;    // si se omite, todos
  umbralDias?: number;
}

/**
 * Calcula las alertas de vencimiento (fecha_entrega + duración del plan),
 * aplicando filtros de estado y proveedor.
 *
 * Usa `fecha_entrega` (no el historial de "cuándo se cambió a Activa") como
 * fecha de arranque del plazo — es la misma fuente que usa el Inventario,
 * así ambas pantallas siempre coinciden. Esto importa sobre todo con datos
 * cargados masivamente: al subir un Excel, el estado puede quedar marcado
 * como "Activa" recién hoy aunque la SIM ya llevara meses entregada — si se
 * contara desde ese cambio de estado, el plazo parecería reiniciar y nunca
 * se generaría la alerta.
 */
export function calcularAlertas(
  sims: SimCurrentView[],
  _ultimaActivacionPorSim: Record<string, string>,
  filtros: FiltrosAlertas = {}
): AlertaVencimiento[] {
  const estados = filtros.estados && filtros.estados.length > 0 ? filtros.estados : ESTADOS_ALERTA_DEFAULT;
  const umbralDias = filtros.umbralDias ?? DIAS_ALERTA_DEFAULT;
  const hoy = new Date();
  const alertas: AlertaVencimiento[] = [];

  for (const sim of sims) {
    if (sim.tipo_plan !== "Prepago") continue;
    if (!sim.estado_actual) continue;
    if (filtros.proveedor && sim.proveedor !== filtros.proveedor) continue;
    if (!sim.fecha_entrega) continue; // sin fecha de entrega no hay plazo que calcular

    const fechaActivacion = new Date(`${sim.fecha_entrega}T00:00:00`);
    const meses = sim.duracion_meses ?? 12; // SIM antiguas sin este dato: se asume 12 meses
    const fechaAniversario = addMonths(fechaActivacion, meses);
    const diasRestantes = differenceInCalendarDays(fechaAniversario, hoy);

    // "Vencida" es un estado calculado (no se guarda en la base de datos):
    // una SIM que sigue "Activa" pero ya cumplió su plazo. El filtro de
    // estados debe dejarla pasar si se pidió "Activa" o "Vencida".
    const esVencidaCalculada = sim.estado_actual === "Activa" && diasRestantes < 0;
    const coincideFiltro = estados.includes(sim.estado_actual) || (esVencidaCalculada && estados.includes("Vencida"));
    if (!coincideFiltro) continue;

    if (diasRestantes <= umbralDias) {
      alertas.push({ sim, fechaActivacion: sim.fecha_entrega, fechaAniversario: fechaAniversario.toISOString(), diasRestantes });
    }
  }

  return alertas.sort((a, b) => a.diasRestantes - b.diasRestantes);
}

/**
 * Versión ligera para la insignia del menú: solo SIM prepago que están
 * ACTUALMENTE activas (no necesita consultar el historial completo).
 */
export function contarAlertasActivas(sims: SimCurrentView[], umbralDias: number = DIAS_ALERTA_DEFAULT): number {
  const hoy = new Date();
  let count = 0;
  for (const sim of sims) {
    if (sim.tipo_plan !== "Prepago") continue;
    if (sim.estado_actual !== "Activa") continue;
    if (!sim.fecha_entrega) continue;
    const meses = sim.duracion_meses ?? 12;
    const diasRestantes = differenceInCalendarDays(addMonths(new Date(`${sim.fecha_entrega}T00:00:00`), meses), hoy);
    if (diasRestantes <= umbralDias) count++;
  }
  return count;
}
