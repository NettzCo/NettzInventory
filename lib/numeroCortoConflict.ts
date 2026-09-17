import { createClient } from "@/lib/supabase/server";
import { EstadoSim } from "@/lib/types";

/**
 * Regla de negocio única para reasignar números cortos (Claro): un número
 * corto solo se puede mover de una SIM a otra si la SIM que lo tiene HOY
 * está "Desactivada". Si está "Activa" (o cualquier otro estado), se
 * bloquea por completo — no se ofrece la opción de reasignar.
 *
 * Este archivo centraliza esa verificación para que se aplique EXACTAMENTE
 * igual en los tres lugares donde se puede reasignar un número corto:
 *   1. La hoja de vida de una SIM individual (reasignación manual).
 *   2. La carga masiva desde Excel (conflicto detectado por fila).
 *   3. El módulo dedicado de reasignación de números cortos.
 */

export interface ConflictoNumeroCorto {
  /** true si no hay ningún conflicto (el número está libre), o si el
   *  conflicto existe pero la SIM que lo tiene hoy está Desactivada —
   *  en ambos casos, es seguro proceder con la reasignación. */
  puedeAsignar: boolean;
  /** ICC de la SIM que tiene el número hoy, si es distinta a la que se
   *  quiere asignar. null si el número está libre o ya es de esa misma SIM. */
  simIdActual: string | null;
  iccActual: string | null;
  estadoActual: EstadoSim | null;
  /** Explicación lista para mostrar a la persona cuando puedeAsignar es
   *  false — o, cuando es true pero había un conflicto, para avisar que se
   *  liberó de otra SIM (transparencia sobre el efecto secundario). */
  mensaje: string | null;
}

/**
 * Revisa si `numeroCorto` puede asignarse a `simIdDestino` dentro de la
 * organización `organizationId`. No modifica nada — solo consulta.
 */
export async function verificarConflictoNumeroCorto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  numeroCorto: string,
  simIdDestino: string
): Promise<ConflictoNumeroCorto> {
  const numero = numeroCorto.trim();

  const { data: dueñoActual } = await supabase
    .from("sim_current_view")
    .select("id, icc, estado_actual")
    .eq("organization_id", organizationId)
    .eq("numero_corto_actual", numero)
    .maybeSingle();

  // Nadie tiene este número hoy: libre para asignar sin restricciones.
  if (!dueñoActual) {
    return { puedeAsignar: true, simIdActual: null, iccActual: null, estadoActual: null, mensaje: null };
  }

  // Ya es de la misma SIM a la que se quiere asignar: no hay nada que hacer.
  if (dueñoActual.id === simIdDestino) {
    return { puedeAsignar: true, simIdActual: dueñoActual.id, iccActual: dueñoActual.icc, estadoActual: dueñoActual.estado_actual as EstadoSim, mensaje: null };
  }

  const estado = dueñoActual.estado_actual as EstadoSim | null;

  if (estado !== "Desactivada") {
    const explicacionEstado = estado ? `está "${estado}"` : "no tiene un estado registrado";
    return {
      puedeAsignar: false,
      simIdActual: dueñoActual.id,
      iccActual: dueñoActual.icc,
      estadoActual: estado,
      mensaje: `El número corto "${numero}" ya está asignado a la SIM ${dueñoActual.icc}, que ${explicacionEstado}. Solo se puede reasignar un número corto cuando la SIM que lo tiene hoy está "Desactivada".`,
    };
  }

  return {
    puedeAsignar: true,
    simIdActual: dueñoActual.id,
    iccActual: dueñoActual.icc,
    estadoActual: estado,
    mensaje: `Se liberó el número corto "${numero}" de la SIM ${dueñoActual.icc} (estaba Desactivada) para asignarlo aquí.`,
  };
}

/**
 * Cierra (libera) el registro activo de `numeroCorto` en `simIdActual`.
 * Se usa justo después de que `verificarConflictoNumeroCorto` confirmó que
 * es seguro reasignar. `cerradoPorOperacionId`, si se indica, queda
 * registrado para poder deshacer la reasignación después.
 */
export async function liberarNumeroCortoDeSim(
  supabase: Awaited<ReturnType<typeof createClient>>,
  simIdActual: string,
  numeroCorto: string,
  cerradoPorOperacionId?: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("sim_short_numbers")
    .update({
      unassigned_at: new Date().toISOString(),
      ...(cerradoPorOperacionId ? { closed_by_bulk_operation_id: cerradoPorOperacionId } : {}),
    })
    .eq("sim_id", simIdActual)
    .eq("numero_corto", numeroCorto.trim())
    .is("unassigned_at", null);

  if (error) return { error: error.message };
  return {};
}
