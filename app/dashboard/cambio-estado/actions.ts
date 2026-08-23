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

export interface AsignacionRapida {
  cliente_nombre: string;
  plan_unidad: string;
  plan_cantidad: string;
  tipo_plan: string;
  pago_momento: string;
  duracion_meses: string;
  precio_cliente: string;
  comercial_id: string;
  broker_id: string;
  fecha_entrega: string;
}

export interface OpcionesCambio {
  cambiarEstado: boolean;
  nuevoEstado?: string;
  fechaActivacion?: string; // solo relevante si nuevoEstado === "Activa"; puede ser una fecha pasada
  cambiarAsignacion: boolean; // cliente, plan, tipo de plan y precio
  asignacion?: AsignacionRapida;
}

export async function aplicarCambios(iccsTexto: string, opciones: OpcionesCambio, nota: string): Promise<ResultadoCambioMasivo> {
  try {
    const { userId, profile } = await getCurrentProfile();
    if (!tieneModulo(profile, "inventario")) {
      return { error: "No tienes acceso al módulo de Inventario." };
    }

    if (!opciones.cambiarEstado && !opciones.cambiarAsignacion) {
      return { error: "Elige al menos algo para cambiar: el estado, o el cliente/plan/precio." };
    }
    if (opciones.cambiarEstado && (!opciones.nuevoEstado || !ESTADOS_SIM.includes(opciones.nuevoEstado as EstadoSim))) {
      return { error: "Indica un estado válido." };
    }
    if (opciones.cambiarAsignacion) {
      const a = opciones.asignacion;
      if (!a || !a.cliente_nombre.trim() || !a.plan_unidad || !a.plan_cantidad || !a.tipo_plan || !a.pago_momento || !a.precio_cliente || !a.comercial_id || !a.fecha_entrega) {
        return { error: "Completa todos los campos del cliente/plan: nombre, cantidad, tipo, forma de pago, precio, comercial y fecha." };
      }
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
        continue;
      }
      // Estas dos validaciones solo tienen sentido cuando SOLO se está
      // cambiando el estado (sin tocar cliente/plan) — si también se va a
      // asignar cliente/plan, la SIM queda válida de todas formas.
      if (!opciones.cambiarAsignacion && opciones.cambiarEstado) {
        if (!sim.entregada) {
          omitidas.push({ icc, motivo: "Todavía no está entregada a ningún cliente" });
          continue;
        }
        if (sim.estado_actual === opciones.nuevoEstado) {
          omitidas.push({ icc, motivo: `Ya estaba en estado "${opciones.nuevoEstado}"` });
          continue;
        }
      }
      aplicables.push(sim);
    }

    if (aplicables.length === 0) {
      return { error: "Ninguna de las SIM indicadas es válida para este cambio.", omitidas };
    }

    const partesNota: string[] = [];
    if (opciones.cambiarEstado) partesNota.push(`estado → ${opciones.nuevoEstado}`);
    if (opciones.cambiarAsignacion) partesNota.push(`cliente/plan → ${opciones.asignacion!.cliente_nombre.trim()}`);

    const { data: operacion, error: errorOperacion } = await supabase
      .from("bulk_operations")
      .insert({
        organization_id: profile.organization_id,
        tipo: "cambio_estado",
        estado_nuevo: opciones.cambiarEstado ? opciones.nuevoEstado : null,
        cantidad_sims: aplicables.length,
        nota: [nota.trim(), partesNota.join(" · ")].filter(Boolean).join(" — ") || null,
        created_by: userId,
      })
      .select("id")
      .single();

    if (errorOperacion) return { error: errorOperacion.message };

    if (opciones.cambiarAsignacion) {
      const a = opciones.asignacion!;

      // Cierra la asignación vigente de las que ya tenían cliente — así
      // queda registrado el cambio, en vez de perder el dato anterior.
      const idsConAsignacion = aplicables.filter((s) => s.entregada).map((s) => s.id);
      if (idsConAsignacion.length > 0) {
        const { error: errorCerrar } = await supabase
          .from("sim_assignments")
          .update({ ended_at: new Date().toISOString(), ended_by_bulk_operation_id: operacion.id })
          .in("sim_id", idsConAsignacion)
          .is("ended_at", null);
        if (errorCerrar) return { error: errorCerrar.message };
      }

      const filasAsignacion = aplicables.map((sim) => ({
        sim_id: sim.id,
        cliente_nombre: a.cliente_nombre.trim(),
        plan_unidad: a.plan_unidad,
        plan_cantidad: Number(a.plan_cantidad),
        tipo_plan: a.tipo_plan,
        pago_momento: a.pago_momento,
        duracion_meses: a.tipo_plan === "Prepago" ? Number(a.duracion_meses) || 12 : null,
        precio_cliente: Number(a.precio_cliente),
        comercial_id: a.comercial_id,
        broker_id: a.broker_id || null,
        fecha_entrega: a.fecha_entrega,
        created_by: userId,
        bulk_operation_id: operacion.id,
      }));

      const { error: errorAsignar } = await supabase.from("sim_assignments").insert(filasAsignacion);
      if (errorAsignar) return { error: errorAsignar.message };
    }

    if (opciones.cambiarEstado) {
      const filas = aplicables.map((sim) => ({
        sim_id: sim.id,
        estado: opciones.nuevoEstado,
        estado_anterior: sim.estado_actual,
        bulk_operation_id: operacion.id,
        changed_by: userId,
        nota: nota.trim() || null,
        ...(opciones.nuevoEstado === "Activa" && opciones.fechaActivacion
          ? { changed_at: new Date(opciones.fechaActivacion).toISOString() }
          : {}),
      }));

      const { error: errorInsert } = await supabase.from("sim_status_history").insert(filas);
      if (errorInsert) return { error: errorInsert.message };
    }

    revalidatePath("/dashboard/cambio-estado");
    revalidatePath("/dashboard/inventario");
    revalidatePath("/dashboard/alertas");
    revalidatePath("/dashboard/nueva");

    return { ok: true, aplicadas: aplicables.length, omitidas };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo aplicar el cambio. Intenta de nuevo." };
  }
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
      .filter((f) => f.estado_anterior)
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

    // 2) Si esta operación creó/cambió asignaciones (cliente, plan, precio),
    // se cierran — la SIM vuelve a quedar sin ese cliente asignado.
    const { error: errorCerrar } = await supabase
      .from("sim_assignments")
      .update({ ended_at: new Date().toISOString() })
      .eq("bulk_operation_id", operacionId)
      .is("ended_at", null);
    if (errorCerrar) return { error: errorCerrar.message };

    // 3) Si esta operación había cerrado asignaciones previas (por ejemplo,
    // al cambiar el cliente de una SIM que ya tenía uno), esas se reabren.
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
