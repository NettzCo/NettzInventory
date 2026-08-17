import { addDays, differenceInCalendarDays } from "date-fns";
import { SimCurrentView, EstadoSim } from "./types";

// Días antes del aniversario en que empieza a mostrarse la alerta.
export const DIAS_ALERTA_DEFAULT = 30;

// Por defecto, el módulo de alertas solo muestra SIM actualmente activas.
// El usuario puede ampliar el filtro a otros estados desde la página.
export const ESTADOS_ALERTA_DEFAULT: EstadoSim[] = ["Activa"];

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
 * Calcula las alertas de vencimiento (1 año desde la última vez que la SIM
 * se activó), aplicando filtros de estado y proveedor.
 *
 * `ultimaActivacionPorSim` debe traer, para cada SIM que alguna vez estuvo
 * "Activa", la fecha del cambio de estado más reciente a "Activa" — así una
 * SIM que hoy está, por ejemplo, "Desactivada" sigue mostrando desde cuándo
 * fue su última activación, si el filtro de estado la incluye.
 */
export function calcularAlertas(
  sims: SimCurrentView[],
  ultimaActivacionPorSim: Record<string, string>,
  filtros: FiltrosAlertas = {}
): AlertaVencimiento[] {
  const estados = filtros.estados && filtros.estados.length > 0 ? filtros.estados : ESTADOS_ALERTA_DEFAULT;
  const umbralDias = filtros.umbralDias ?? DIAS_ALERTA_DEFAULT;
  const hoy = new Date();
  const alertas: AlertaVencimiento[] = [];

  for (const sim of sims) {
    if (sim.tipo_plan !== "Prepago") continue;
    if (!sim.estado_actual || !estados.includes(sim.estado_actual)) continue;
    if (filtros.proveedor && sim.proveedor !== filtros.proveedor) continue;

    const fechaActivacionStr = ultimaActivacionPorSim[sim.id];
    if (!fechaActivacionStr) continue; // nunca ha estado activa: no hay aniversario que calcular

    const fechaActivacion = new Date(fechaActivacionStr);
    const fechaAniversario = addDays(fechaActivacion, 365);
    const diasRestantes = differenceInCalendarDays(fechaAniversario, hoy);

    if (diasRestantes <= umbralDias) {
      alertas.push({ sim, fechaActivacion: fechaActivacionStr, fechaAniversario: fechaAniversario.toISOString(), diasRestantes });
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
    if (!sim.estado_desde) continue;
    const diasRestantes = differenceInCalendarDays(addDays(new Date(sim.estado_desde), 365), hoy);
    if (diasRestantes <= umbralDias) count++;
  }
  return count;
}
