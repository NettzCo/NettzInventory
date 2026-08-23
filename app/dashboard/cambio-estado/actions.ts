"use server";

import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { tieneModulo } from "@/lib/modules";
import { ESTADOS_SIM, EstadoSim } from "@/lib/types";
import { revalidatePath } from "next/cache";

interface SimEncontrada {
  id: string;
  icc: string;
  estado_actual: EstadoSim | null;
  entregada: boolean;
}

async function buscarSimsPorIcc(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  iccs: string[]
): Promise<Map<string, SimEncontrada>> {
  const { data: sims } = await supabase
    .from("sim_current_view")
    .select("id, icc, estado_actual, cliente_actual")
    .eq("organization_id", organizationId)
    .in("icc", iccs);

  const mapa = new Map<string, SimEncontrada>();
  for (const s of sims ?? []) {
    mapa.set(s.icc, {
      id: s.id,
      icc: s.icc,
      estado_actual: s.estado_actual,
      entregada: s.cliente_actual !== null,
    });
  }
  return mapa;
}

export interface ResultadoCambioMasivo {
  error?: string;
  ok?: boolean;
  aplicadas?: number;
  omitidas?: { icc: string; motivo: string }[];
}

export async function cambiarEstadoMasivo(iccsTexto: string, nuevoEstado: string, nota: string): Promise<ResultadoCambioMasivo> {
  try {
    const { userId, profile } = await getCurrentProfile();
    if (!tieneModulo(profile, "inventario")) {
      return { error: "No tienes acceso al módulo de Inventario." };
    }
    if (!ESTADOS_SIM.includes(nuevoEstado as EstadoSim)) {
      return { error: "Estado no válido." };
    }

    const iccs = Array.from(
      new Set(
        iccsTexto
          .split(/[\n,;]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );
    if (iccs.length === 0) {
      return { error: "Pega o escribe al menos un ICC." };
    }

    const supabase = await createClient();
    const encontradas = await buscarSimsPorIcc(supabase, profile.organization_id, iccs);

    const omitidas: { icc: string; motivo: string }[] = [];
    const aplicables: SimEncontrada[] = [];

    for (const icc of iccs) {
      const sim = encontradas.get(icc);
      if (!sim) {
        omitidas.push({ icc, motivo: "No se encontró ese ICC" });
      } else if (!sim.entregada) {
        omitidas.push({ icc, motivo: "Todavía no está entregada a ningún cliente" });
      } else if (sim.estado_actual === nuevoEstado) {
        omitidas.push({ icc, motivo: `Ya estaba en estado "${nuevoEstado}"` });
      } else {
        aplicables.push(sim);
      }
    }

    if (aplicables.length === 0) {
      return { error: "Ninguna de las SIM indicadas es válida para este cambio.", omitidas };
    }

    const { data: operacion, error: errorOperacion } = await supabase
      .from("bulk_operations")
      .insert({
        organization_id: profile.organization_id,
        tipo: "cambio_estado",
        estado_nuevo: nuevoEstado,
        cantidad_sims: aplicables.length,
        nota: nota.trim() || null,
        created_by: userId,
      })
      .select("id")
      .single();

    if (errorOperacion) return { error: errorOperacion.message };

    const filas = aplicables.map((sim) => ({
      sim_id: sim.id,
      estado: nuevoEstado,
      estado_anterior: sim.estado_actual,
      bulk_operation_id: operacion.id,
      changed_by: userId,
      nota: nota.trim() || null,
    }));

    const { error: errorInsert } = await supabase.from("sim_status_history").insert(filas);
    if (errorInsert) return { error: errorInsert.message };

    revalidatePath("/dashboard/cambio-estado");
    revalidatePath("/dashboard/inventario");
    revalidatePath("/dashboard/alertas");

    return { ok: true, aplicadas: aplicables.length, omitidas };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo aplicar el cambio. Intenta de nuevo." };
  }
}

export async function cambiarEstadoIndividual(icc: string, nuevoEstado: string, nota: string): Promise<ResultadoCambioMasivo> {
  return cambiarEstadoMasivo(icc, nuevoEstado, nota);
}

export async function revertirOperacionMasiva(operacionId: string) {
  try {
    const { userId, profile } = await getCurrentProfile();
    if (!tieneModulo(profile, "inventario")) {
      return { error: "No tienes acceso al módulo de Inventario." };
    }

    const supabase = await createClient();

    const { data: operacion } = await supabase
      .from("bulk_operations")
      .select("id, created_by, revertida_at")
      .eq("id", operacionId)
      .maybeSingle();

    if (!operacion) return { error: "No se encontró esa operación." };
    if (operacion.revertida_at) return { error: "Esta operación ya había sido deshecha." };
    if (operacion.created_by !== userId && !profile.role_es_sistema) {
      return { error: "Solo quien hizo el cambio (o un super administrador) puede deshacerlo." };
    }

    // 1) Revertir los cambios de estado que vinieron de esta operación.
    const { data: filasAfectadas } = await supabase
      .from("sim_status_history")
      .select("sim_id, estado_anterior")
      .eq("bulk_operation_id", operacionId);

    const filasRevertir = (filasAfectadas ?? [])
      .filter((f) => f.estado_anterior) // no se puede volver a un estado que no se conocía
      .map((f) => ({
        sim_id: f.sim_id,
        estado: f.estado_anterior,
        estado_anterior: null,
        bulk_operation_id: null,
        changed_by: userId,
        nota: "Revertido de una operación anterior.",
      }));

    if (filasRevertir.length > 0) {
      const { error: errorRevertir } = await supabase.from("sim_status_history").insert(filasRevertir);
      if (errorRevertir) return { error: errorRevertir.message };
    }

    // 2) Si esta operación creó asignaciones nuevas (entregas), se cierran —
    // la SIM vuelve a quedar sin cliente asignado.
    const { error: errorCerrar } = await supabase
      .from("sim_assignments")
      .update({ ended_at: new Date().toISOString() })
      .eq("bulk_operation_id", operacionId)
      .is("ended_at", null);
    if (errorCerrar) return { error: errorCerrar.message };

    // 3) Si esta operación había cerrado asignaciones previas (por ejemplo,
    // al actualizar una entrega ya existente), esas se reabren.
    const { error: errorReabrir } = await supabase
      .from("sim_assignments")
      .update({ ended_at: null, ended_by_bulk_operation_id: null })
      .eq("ended_by_bulk_operation_id", operacionId);
    if (errorReabrir) return { error: errorReabrir.message };

    const { error: errorMarcar } = await supabase
      .from("bulk_operations")
      .update({ revertida_at: new Date().toISOString(), revertida_by: userId })
      .eq("id", operacionId);

    if (errorMarcar) return { error: errorMarcar.message };

    revalidatePath("/dashboard/cambio-estado");
    revalidatePath("/dashboard/nueva");
    revalidatePath("/dashboard/inventario");
    revalidatePath("/dashboard/alertas");

    return { ok: true, revertidas: filasRevertir.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo deshacer la operación. Intenta de nuevo." };
  }
}
