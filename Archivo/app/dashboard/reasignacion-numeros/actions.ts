"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { revalidatePath } from "next/cache";
import { tieneModulo } from "@/lib/modules";
import { EstadoSim } from "@/lib/types";
import { clasificarNumeroCorto, liberarYDesactivarOrigen } from "@/lib/numeroCortoSwap";
import { activarSiEsperabaNumero } from "@/lib/estadoSinNumero";

async function requireEditor() {
  const { userId, profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "inventario")) {
    throw new Error("No tienes permiso para reasignar números cortos.");
  }
  return { userId, profile };
}

/** Datos de la SIM nueva cuando el ICC destino no existe todavía en el
 *  inventario — se piden los mismos campos que en "Registrar entrega". */
export interface DatosNuevaSim {
  clienteNombre: string;
  planUnidad: string;
  planCantidad: string;
  tipoPlan: string;
  pagoMomento: string;
  duracionMeses?: string;
  precioCliente: string;
  fechaEntrega?: string;
  comercialId: string;
  brokerId?: string;
  apn?: string;
  observaciones?: string;
}

export interface ParReasignacion {
  numeroCorto: string;
  iccDestino: string;
  /** Presente cuando el ICC destino no existe y se está creando de una vez. */
  nuevaSim?: DatosNuevaSim;
}

export type EstadoOrigenNumero = "asignado" | "libre" | "no_existe";

export interface AnalisisFila {
  fila: number;
  numeroCorto: string;
  iccDestino: string;
  error: string | null; // si tiene algo, la fila NO se puede aplicar
  sinCambios: boolean; // el número ya está exactamente en el ICC destino
  requiereCreacion: boolean; // el ICC destino no existe — hay que llenar el formulario de una SIM nueva antes de poder aplicar esta fila
  estadoOrigen: EstadoOrigenNumero;
  simIdOrigen: string | null;
  iccOrigen: string | null;
  clienteOrigen: string | null;
  estadoIccOrigen: EstadoSim | null;
  simIdDestino: string | null;
  clienteDestino: string | null;
  estadoIccDestino: EstadoSim | null;
  numeroActualDestino: string | null; // número que el ICC destino ya tenía (si tenía otro)
  resumen: string;
  incluir: boolean; // por defecto true — la persona puede desmarcarla en la UI
}

const RESUMEN_ORIGEN: Record<EstadoOrigenNumero, (f: Pick<AnalisisFila, "numeroCorto" | "iccOrigen" | "clienteOrigen" | "estadoIccOrigen" | "iccDestino">) => string> = {
  asignado: (f) =>
    `El número ${f.numeroCorto} está hoy en el ICC ${f.iccOrigen} (cliente: ${f.clienteOrigen ?? "sin cliente"}, estado: ${f.estadoIccOrigen}). ` +
    `Se pasará al ICC ${f.iccDestino} y el ICC ${f.iccOrigen} quedará Desactivada.`,
  libre: (f) => `El número ${f.numeroCorto} no está asignado a ningún ICC hoy. Se asignará al ICC ${f.iccDestino}.`,
  no_existe: (f) => `El número ${f.numeroCorto} es nuevo — no tiene historial en el sistema. Se asignará al ICC ${f.iccDestino}.`,
};

/** Analiza un solo par (numeroCorto, iccDestino) contra el estado ACTUAL de
 *  la base de datos — usada tanto para la previsualización como, de nuevo,
 *  justo antes de aplicar cada fila (por si el estado cambió mientras tanto,
 *  por ejemplo por otra fila de la misma tanda ya aplicada). */
async function analizarPar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  fila: number,
  numeroCortoCrudo: string,
  iccDestinoCrudo: string
): Promise<AnalisisFila> {
  const numeroCorto = numeroCortoCrudo.trim();
  const iccDestino = iccDestinoCrudo.trim();

  const base: AnalisisFila = {
    fila,
    numeroCorto,
    iccDestino,
    error: null,
    sinCambios: false,
    requiereCreacion: false,
    estadoOrigen: "no_existe",
    simIdOrigen: null,
    iccOrigen: null,
    clienteOrigen: null,
    estadoIccOrigen: null,
    simIdDestino: null,
    clienteDestino: null,
    estadoIccDestino: null,
    numeroActualDestino: null,
    resumen: "",
    incluir: true,
  };

  if (!numeroCorto || !iccDestino) {
    return { ...base, error: "Falta el número corto o el ICC destino.", incluir: false };
  }

  const { data: destino } = await supabase
    .from("sim_current_view")
    .select("id, icc, proveedor, numero_corto_actual, cliente_actual, estado_actual")
    .eq("organization_id", organizationId)
    .eq("icc", iccDestino)
    .maybeSingle();

  if (!destino) {
    // No es un error bloqueante: se ofrece crear la SIM de una vez, con
    // los mismos datos que pediría "Registrar entrega" (cliente, plan,
    // etc.) — la persona los completa en la tanda antes de aplicar.
    return {
      ...base,
      requiereCreacion: true,
      incluir: false,
      resumen: `El ICC ${iccDestino} no existe en el inventario. Completa los datos de cliente y plan para crearlo y asignarle este número.`,
    };
  }
  if (destino.proveedor?.toUpperCase() !== "CLARO") {
    return { ...base, error: `El ICC ${iccDestino} es de ${destino.proveedor}, no de Claro. Esta herramienta solo reasigna números Claro.`, incluir: false };
  }

  base.simIdDestino = destino.id;
  base.clienteDestino = destino.cliente_actual;
  base.estadoIccDestino = (destino.estado_actual as EstadoSim | null) ?? null;

  // ¿A quién pertenece hoy este número corto? (nadie / alguien / nunca existió)
  const clasificacion = await clasificarNumeroCorto(supabase, organizationId, numeroCorto);
  base.estadoOrigen = clasificacion.estadoOrigen;
  base.simIdOrigen = clasificacion.simIdOrigen;
  base.iccOrigen = clasificacion.iccOrigen;
  base.clienteOrigen = clasificacion.clienteOrigen;
  base.estadoIccOrigen = clasificacion.estadoIccOrigen;

  if (base.estadoOrigen === "asignado" && base.iccOrigen === iccDestino) {
    return { ...base, sinCambios: true, incluir: false, resumen: `El número ${numeroCorto} ya está asignado al ICC ${iccDestino}. No hay nada que hacer.` };
  }

  if (destino.numero_corto_actual && destino.numero_corto_actual !== numeroCorto) {
    base.numeroActualDestino = destino.numero_corto_actual;
  }

  let resumen = RESUMEN_ORIGEN[base.estadoOrigen](base);
  if (base.numeroActualDestino) {
    resumen += ` El ICC ${iccDestino} ya tenía el número ${base.numeroActualDestino} asignado — ese número quedará suelto (sin ningún ICC).`;
  }
  if (base.estadoIccDestino === "Sin número corto") {
    resumen += ` El ICC ${iccDestino} estaba "Sin número corto" — pasará a "Activa" automáticamente.`;
  }
  base.resumen = resumen;

  return base;
}

export async function previsualizarReasignaciones(pares: ParReasignacion[]): Promise<{ error?: string; filas?: AnalisisFila[] }> {
  const { profile } = await requireEditor();
  const supabase = await createClient();

  if (pares.length === 0) return { error: "Agrega al menos un número corto con su ICC destino." };
  if (pares.length > 500) return { error: "Máximo 500 filas por tanda." };

  const filas = await Promise.all(
    pares.map((p, i) => analizarPar(supabase, profile.organization_id, i + 1, p.numeroCorto, p.iccDestino))
  );

  // Duplicados DENTRO de la misma tanda: ambiguos, se bloquean ambas filas.
  const conteoNumero = new Map<string, number>();
  const conteoIcc = new Map<string, number>();
  for (const f of filas) {
    if (f.numeroCorto) conteoNumero.set(f.numeroCorto, (conteoNumero.get(f.numeroCorto) ?? 0) + 1);
    if (f.iccDestino) conteoIcc.set(f.iccDestino, (conteoIcc.get(f.iccDestino) ?? 0) + 1);
  }
  for (const f of filas) {
    if (f.error) continue;
    if ((conteoNumero.get(f.numeroCorto) ?? 0) > 1) {
      f.error = `El número ${f.numeroCorto} aparece más de una vez en esta lista.`;
      f.incluir = false;
    } else if ((conteoIcc.get(f.iccDestino) ?? 0) > 1) {
      f.error = `El ICC ${f.iccDestino} aparece más de una vez en esta lista.`;
      f.incluir = false;
    }
  }

  return { filas };
}

/** Crea la SIM (sim_cards + estado inicial Activa + cliente/plan), igual
 *  que "Registrar entrega" — se usa cuando el ICC destino de una
 *  reasignación no existe todavía. Siempre Claro, porque este módulo es
 *  solo para números Claro. Si algo falla a mitad de camino, revierte lo
 *  ya creado para no dejar una SIM a medias. */
async function crearSimDesdeReasignacion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  userId: string,
  operacionId: string,
  icc: string,
  datos: DatosNuevaSim
): Promise<{ simId?: string; error?: string }> {
  if (
    !datos.clienteNombre?.trim() ||
    !datos.planUnidad ||
    !datos.planCantidad ||
    !datos.tipoPlan ||
    !datos.pagoMomento ||
    !datos.precioCliente ||
    !datos.comercialId
  ) {
    return { error: `Faltan datos del cliente/plan para crear el ICC ${icc} (cliente, plan, tipo de plan, forma de pago, precio y comercial son obligatorios).` };
  }

  const { data: simCard, error: errorSim } = await supabase
    .from("sim_cards")
    .insert({
      organization_id: organizationId,
      icc,
      proveedor: "CLARO",
      apn: datos.apn?.trim() || null,
      observaciones: datos.observaciones?.trim() || null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (errorSim) return { error: `No se pudo crear el ICC ${icc}: ${errorSim.message}` };
  const simId = simCard.id as string;

  const { error: errorEstado } = await supabase.from("sim_status_history").insert({
    sim_id: simId,
    estado: "Activa",
    changed_by: userId,
    nota: "Creada desde el módulo de reasignación de números cortos.",
    bulk_operation_id: operacionId,
  });
  if (errorEstado) {
    await supabase.from("sim_cards").delete().eq("id", simId);
    return { error: `No se pudo registrar el estado inicial del ICC ${icc}: ${errorEstado.message}` };
  }

  const { error: errorAsignacion } = await supabase.from("sim_assignments").insert({
    sim_id: simId,
    cliente_nombre: datos.clienteNombre.trim(),
    plan_unidad: datos.planUnidad,
    plan_cantidad: Number(datos.planCantidad),
    tipo_plan: datos.tipoPlan,
    pago_momento: datos.pagoMomento,
    duracion_meses: datos.tipoPlan === "Prepago" ? Number(datos.duracionMeses) || 12 : null,
    precio_cliente: Number(datos.precioCliente),
    comercial_id: datos.comercialId,
    broker_id: datos.brokerId || null,
    fecha_entrega: datos.fechaEntrega || new Date().toISOString().slice(0, 10),
    created_by: userId,
    bulk_operation_id: operacionId,
  });
  if (errorAsignacion) {
    await supabase.from("sim_cards").delete().eq("id", simId);
    return { error: `No se pudo asignar el cliente/plan al ICC ${icc}: ${errorAsignacion.message}` };
  }

  return { simId };
}

export interface FilaResultado {
  fila: number;
  numeroCorto: string;
  iccDestino: string;
  ok: boolean;
  error?: string;
}

export async function aplicarReasignaciones(pares: ParReasignacion[], nota: string): Promise<{ error?: string; ok?: boolean; aplicadas?: number; resultados?: FilaResultado[]; operacionId?: string }> {
  const { userId, profile } = await requireEditor();
  const supabase = await createClient();

  if (pares.length === 0) return { error: "No hay nada para aplicar." };

  const { data: operacion, error: errorOperacion } = await supabase
    .from("bulk_operations")
    .insert({
      organization_id: profile.organization_id,
      tipo: "reasignacion_numero",
      cantidad_sims: pares.length,
      nota: nota.trim() || null,
      created_by: userId,
    })
    .select("id")
    .single();

  if (errorOperacion) return { error: errorOperacion.message };
  const operacionId = operacion.id as string;

  const resultados: FilaResultado[] = [];
  let aplicadas = 0;

  for (let i = 0; i < pares.length; i++) {
    const par = pares[i];
    try {
      // Se vuelve a analizar en este momento (no se confía en la previsualización
      // vieja) — así, si una fila anterior de esta misma tanda ya movió este
      // mismo ICC o número, esta fila ve la situación real y actualizada.
      let f = await analizarPar(supabase, profile.organization_id, i + 1, par.numeroCorto, par.iccDestino);

      if (f.requiereCreacion) {
        if (!par.nuevaSim) {
          resultados.push({ fila: i + 1, numeroCorto: f.numeroCorto, iccDestino: f.iccDestino, ok: false, error: `Falta completar los datos del ICC ${f.iccDestino} para crearlo.` });
          continue;
        }
        const { simId, error: errorCrear } = await crearSimDesdeReasignacion(supabase, profile.organization_id, userId, operacionId, f.iccDestino, par.nuevaSim);
        if (errorCrear || !simId) {
          resultados.push({ fila: i + 1, numeroCorto: f.numeroCorto, iccDestino: f.iccDestino, ok: false, error: errorCrear ?? "No se pudo crear el ICC." });
          continue;
        }
        // El ICC recién creado ya nace "Activa" y sin conflicto — se
        // vuelve a analizar para que el resto del flujo (liberar del
        // origen si aplica, etc.) siga exactamente igual que con un ICC
        // que ya existía.
        f = await analizarPar(supabase, profile.organization_id, i + 1, par.numeroCorto, f.iccDestino);
      }

      if (f.error) {
        resultados.push({ fila: i + 1, numeroCorto: f.numeroCorto, iccDestino: f.iccDestino, ok: false, error: f.error });
        continue;
      }
      if (f.sinCambios) {
        resultados.push({ fila: i + 1, numeroCorto: f.numeroCorto, iccDestino: f.iccDestino, ok: true });
        continue;
      }

      // 1) Si el número ya estaba en OTRO ICC: se libera y ese ICC queda Desactivada.
      if (f.estadoOrigen === "asignado" && f.simIdOrigen && f.simIdOrigen !== f.simIdDestino) {
        const { error: errorOrigen } = await liberarYDesactivarOrigen(
          supabase,
          userId,
          { estadoOrigen: f.estadoOrigen, simIdOrigen: f.simIdOrigen, iccOrigen: f.iccOrigen, clienteOrigen: f.clienteOrigen, estadoIccOrigen: f.estadoIccOrigen },
          f.numeroCorto,
          f.iccDestino,
          operacionId
        );
        if (errorOrigen) throw new Error(errorOrigen);
      }

      // 2) Si el ICC destino ya tenía OTRO número corto propio: se libera y queda suelto.
      if (f.numeroActualDestino) {
        const { error: errorLiberarDestino } = await supabase
          .from("sim_short_numbers")
          .update({ unassigned_at: new Date().toISOString(), closed_by_bulk_operation_id: operacionId })
          .eq("sim_id", f.simIdDestino!)
          .eq("numero_corto", f.numeroActualDestino)
          .is("unassigned_at", null);
        if (errorLiberarDestino) throw new Error(`No se pudo liberar el número anterior del ICC ${f.iccDestino}: ${errorLiberarDestino.message}`);
      }

      // 3) Se asigna el número al ICC destino.
      const { error: errorAsignar } = await supabase.from("sim_short_numbers").insert({
        sim_id: f.simIdDestino,
        organization_id: profile.organization_id,
        numero_corto: f.numeroCorto,
        assigned_by: userId,
        bulk_operation_id: operacionId,
      });
      if (errorAsignar) throw new Error(`No se pudo asignar el número al ICC ${f.iccDestino}: ${errorAsignar.message}`);

      const { error: errorActivar } = await activarSiEsperabaNumero(supabase, f.simIdDestino!, userId, f.estadoIccDestino, operacionId);
      if (errorActivar) throw new Error(errorActivar);

      aplicadas++;
      resultados.push({ fila: i + 1, numeroCorto: f.numeroCorto, iccDestino: f.iccDestino, ok: true });
    } catch (e) {
      resultados.push({ fila: i + 1, numeroCorto: par.numeroCorto, iccDestino: par.iccDestino, ok: false, error: e instanceof Error ? e.message : "Error desconocido." });
    }
  }

  await supabase.from("bulk_operations").update({ cantidad_sims: aplicadas }).eq("id", operacionId);

  revalidatePath("/dashboard/reasignacion-numeros");
  revalidatePath("/dashboard/inventario");
  revalidatePath("/dashboard/inventario/numeros-disponibles");
  revalidatePath("/dashboard/alertas");

  return { ok: true, aplicadas, resultados, operacionId };
}

export async function revertirReasignacion(operacionId: string) {
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

    // 1) Reabrir los números que esta operación había liberado.
    const { error: errorReabrir } = await supabase
      .from("sim_short_numbers")
      .update({ unassigned_at: null, closed_by_bulk_operation_id: null })
      .eq("closed_by_bulk_operation_id", operacionId);
    if (errorReabrir) return { error: errorReabrir.message };

    // 2) Cerrar los números que esta operación había asignado de nuevo.
    const { error: errorCerrar } = await supabase
      .from("sim_short_numbers")
      .update({ unassigned_at: new Date().toISOString() })
      .eq("bulk_operation_id", operacionId)
      .is("unassigned_at", null);
    if (errorCerrar) return { error: errorCerrar.message };

    // 3) Revertir las desactivaciones automáticas que causó esta operación.
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

    const { error: errorMarcar } = await supabase
      .from("bulk_operations")
      .update({ revertida_at: new Date().toISOString(), revertida_by: userId })
      .eq("id", operacionId);
    if (errorMarcar) return { error: errorMarcar.message };

    revalidatePath("/dashboard/reasignacion-numeros");
    revalidatePath("/dashboard/inventario");
    revalidatePath("/dashboard/inventario/numeros-disponibles");
    revalidatePath("/dashboard/alertas");

    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo deshacer la operación. Intenta de nuevo." };
  }
}
