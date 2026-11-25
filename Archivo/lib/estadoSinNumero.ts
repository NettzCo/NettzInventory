import { createClient } from "@/lib/supabase/server";
import { EstadoSim } from "@/lib/types";

/**
 * Una SIM Claro sin número corto asignado no puede considerarse "Activa" de
 * verdad — sin número no funciona para el cliente. En vez de dejarla en
 * "Activa" igual, se guarda como "Sin número corto".
 *
 * Se aplica en TODOS los lugares donde se guarda un estado "Activa" para
 * una SIM (Cambiar estado, Gestión de SIMs, Hoja de Vida) — nunca se anula
 * un estado explícito distinto de "Activa" (Desactivada, Vencida, etc. se
 * respetan tal cual, ya explican por su cuenta por qué no está en uso).
 */
export const ESTADO_SIN_NUMERO_CORTO: EstadoSim = "Sin número corto";

/** Decide qué estado se debe guardar REALMENTE, dado el que se pidió. */
export function resolverEstadoAGuardar(params: {
  estadoDeseado: string;
  proveedor: string | null;
  tieneNumeroCorto: boolean;
}): string {
  const { estadoDeseado, proveedor, tieneNumeroCorto } = params;
  if (estadoDeseado === "Activa" && proveedor?.toUpperCase() === "CLARO" && !tieneNumeroCorto) {
    return ESTADO_SIN_NUMERO_CORTO;
  }
  return estadoDeseado;
}

/** Después de asignar un número corto a una SIM: si estaba "Sin número
 *  corto" esperando justamente esto, pasa a "Activa" automáticamente —
 *  queda una fila nueva en el historial, como cualquier otro cambio. */
export async function activarSiEsperabaNumero(
  supabase: Awaited<ReturnType<typeof createClient>>,
  simId: string,
  userId: string,
  estadoActualPrevio: string | null | undefined,
  bulkOperationId?: string
): Promise<{ error?: string }> {
  if (estadoActualPrevio !== ESTADO_SIN_NUMERO_CORTO) return {};

  const { error } = await supabase.from("sim_status_history").insert({
    sim_id: simId,
    estado: "Activa",
    estado_anterior: ESTADO_SIN_NUMERO_CORTO,
    changed_by: userId,
    nota: "Pasó a Activa automáticamente: ya tiene número corto asignado.",
    ...(bulkOperationId ? { bulk_operation_id: bulkOperationId } : {}),
  });

  return error ? { error: error.message } : {};
}
