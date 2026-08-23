import { EstadoSim } from "@/lib/types";

/**
 * SIMPro no publica en su spec los valores exactos que puede traer
 * `customer_status.ident` / `workflow_status.ident` (el spec solo dice
 * "string", sin enum) — así que este mapeo es un punto de partida con los
 * nombres más comunes en la industria de conectividad IoT/M2M, no una
 * garantía de que sean exactamente los que usa tu cuenta.
 *
 * Cualquier valor que llegue y NO esté aquí cae en "Inactiva" por defecto,
 * y queda registrado en el log de sincronización con el valor real que
 * trajo SIMPro — así, después de la primera sincronización real, se puede
 * revisar el log, ver qué valores aparecieron sin mapear, y agregarlos
 * aquí con el estado que corresponda.
 */
export const MAPEO_ESTADO_SIMPRO: Record<string, EstadoSim> = {
  // Comunes en customer_status / workflow_status de plataformas M2M:
  ACTIVE: "Activa",
  ACTIVATED: "Activa",
  READY: "Lista para activar",
  TEST_READY: "Lista para activar",
  INVENTORY: "Lista para activar",
  STOCK: "Lista para activar",
  SUSPENDED: "Desactivada temporal",
  SOFT_SUSPENDED: "Desactivada temporal",
  HARD_SUSPENDED: "Desactivada",
  DEACTIVATED: "Desactivada",
  TERMINATED: "Desactivada",
  CANCELLED: "Desactivada",
  CANCELED: "Desactivada",
  BARRED: "Desactivada temporal",
};

export interface ResultadoMapeoEstado {
  estado: EstadoSim;
  reconocido: boolean;
  valorOriginal: string | null;
}

export function mapearEstadoSimpro(customerStatusIdent: string | null | undefined, workflowStatusIdent: string | null | undefined): ResultadoMapeoEstado {
  const valorOriginal = customerStatusIdent || workflowStatusIdent || null;
  if (!valorOriginal) {
    return { estado: "Lista para activar", reconocido: false, valorOriginal: null };
  }
  const normalizado = valorOriginal.trim().toUpperCase().replace(/\s+/g, "_");
  const estado = MAPEO_ESTADO_SIMPRO[normalizado];
  if (estado) return { estado, reconocido: true, valorOriginal };
  return { estado: "Inactiva", reconocido: false, valorOriginal };
}
