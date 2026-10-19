import { createClient } from "@/lib/supabase/server";
import { EstadoSim } from "@/lib/types";

/**
 * Lógica PERMISIVA de reasignación de números cortos — comparte código entre
 * el módulo dedicado "Reasignar números cortos" y el botón "Reasignar
 * número corto" de la Hoja de Vida de cada SIM, para que los dos se
 * comporten EXACTAMENTE igual (un solo lugar donde vive la regla).
 *
 * A diferencia de `lib/numeroCortoConflict.ts` (usada en la carga masiva,
 * donde se bloquea por completo si la otra SIM no está Desactivada), aquí
 * SÍ se permite tomar un número de cualquier SIM sin importar su estado —
 * como efecto, esa SIM queda Desactivada automáticamente. Esta versión más
 * permisiva es para las herramientas manuales, con la persona confirmando
 * a propósito la reasignación.
 */

export type EstadoOrigenNumero = "asignado" | "libre" | "no_existe";

export interface EstadoNumeroCorto {
  estadoOrigen: EstadoOrigenNumero;
  simIdOrigen: string | null;
  iccOrigen: string | null;
  clienteOrigen: string | null;
  estadoIccOrigen: EstadoSim | null;
}

/** Clasifica un número corto: si no existe ningún registro suyo (nuevo),
 *  si existe pero nadie lo tiene hoy (libre), o si hoy pertenece a una SIM
 *  (asignado, con los datos de esa SIM). */
export async function clasificarNumeroCorto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  numeroCorto: string
): Promise<EstadoNumeroCorto> {
  const numero = numeroCorto.trim();

  const { data: historial } = await supabase
    .from("sim_short_numbers")
    .select("sim_id, unassigned_at")
    .eq("organization_id", organizationId)
    .eq("numero_corto", numero);

  const activo = (historial ?? []).find((h) => h.unassigned_at === null);

  if (!activo) {
    return {
      estadoOrigen: (historial ?? []).length > 0 ? "libre" : "no_existe",
      simIdOrigen: null,
      iccOrigen: null,
      clienteOrigen: null,
      estadoIccOrigen: null,
    };
  }

  const { data: origen } = await supabase
    .from("sim_current_view")
    .select("icc, estado_actual, cliente_actual")
    .eq("id", activo.sim_id)
    .maybeSingle();

  return {
    estadoOrigen: "asignado",
    simIdOrigen: activo.sim_id,
    iccOrigen: origen?.icc ?? null,
    clienteOrigen: origen?.cliente_actual ?? null,
    estadoIccOrigen: (origen?.estado_actual as EstadoSim | null) ?? null,
  };
}

/** Le quita el número corto a la SIM que lo tenía y la deja "Desactivada" —
 *  sin importar el estado en el que estuviera antes (incluida "Activa").
 *  Se usa justo después de que la persona confirmó la reasignación. */
export async function liberarYDesactivarOrigen(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  origen: EstadoNumeroCorto,
  numeroCorto: string,
  iccDestino: string,
  bulkOperationId?: string
): Promise<{ error?: string }> {
  if (!origen.simIdOrigen) return {};

  const { error: errorLiberar } = await supabase
    .from("sim_short_numbers")
    .update({
      unassigned_at: new Date().toISOString(),
      ...(bulkOperationId ? { closed_by_bulk_operation_id: bulkOperationId } : {}),
    })
    .eq("sim_id", origen.simIdOrigen)
    .eq("numero_corto", numeroCorto.trim())
    .is("unassigned_at", null);
  if (errorLiberar) return { error: `No se pudo liberar el número del ICC ${origen.iccOrigen}: ${errorLiberar.message}` };

  const { error: errorDesactivar } = await supabase.from("sim_status_history").insert({
    sim_id: origen.simIdOrigen,
    estado: "Desactivada",
    estado_anterior: origen.estadoIccOrigen,
    changed_by: userId,
    nota: `Desactivada automáticamente: su número corto ${numeroCorto.trim()} se reasignó al ICC ${iccDestino}.`,
    ...(bulkOperationId ? { bulk_operation_id: bulkOperationId } : {}),
  });
  if (errorDesactivar) return { error: `Se liberó el número del ICC ${origen.iccOrigen}, pero no se pudo desactivarla: ${errorDesactivar.message}` };

  return {};
}
