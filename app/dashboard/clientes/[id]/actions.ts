"use server";

import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tieneModulo } from "@/lib/modules";
import { revalidatePath } from "next/cache";
import { EstadoSim } from "@/lib/types";

export interface DesactivacionVigente {
  id: string;
  tipo_desactivacion: "total" | "cartera";
  proveedores_incluidos: string[] | null;
  cantidad_sims: number;
  nota: string | null;
  created_at: string;
  created_by: string;
}

/** Desactiva masivamente todas las SIM de un cliente (o solo las de
 *  ciertos proveedores, si se indican). Cada SIM afectada queda con su
 *  estado individual anterior guardado en `sim_status_history.estado_anterior`
 *  — eso es lo que permite que, al reactivar, cada una vuelva EXACTAMENTE a
 *  como estaba (no todas a "Activa" a la fuerza): la función que revierte
 *  (`revertirOperacionMasiva`, en cambio-estado/actions.ts) ya hace esto de
 *  forma genérica para cualquier operación masiva, así que no se duplica
 *  esa lógica acá. */
export async function desactivarCliente(
  clienteNombre: string,
  tipo: "total" | "cartera",
  proveedores: string[] // [] = todos los proveedores
) {
  try {
    const { userId, profile } = await getCurrentProfile();
    if (!tieneModulo(profile, "clientes")) {
      return { error: "No tienes acceso al módulo de Clientes." };
    }
    if (!clienteNombre?.trim()) return { error: "Falta el nombre del cliente." };

    // Se usa el cliente administrativo (sin RLS) porque esta acción toca
    // tablas del módulo de Inventario (sim_status_history, bulk_operations)
    // desde el módulo de Clientes — mismo patrón que ya usa Pagos
    // adelantados para renovar SIM sin requerir también el módulo Inventario.
    const admin = createAdminClient();

    let query = admin
      .from("sim_current_view")
      .select("id, estado_actual, proveedor")
      .eq("organization_id", profile.organization_id)
      .eq("cliente_actual", clienteNombre.trim());
    if (proveedores.length > 0) query = query.in("proveedor", proveedores);

    const { data: sims, error: errorSims } = await query;
    if (errorSims) return { error: errorSims.message };
    if (!sims || sims.length === 0) {
      return { error: "Este cliente no tiene SIM activas para desactivar con ese filtro." };
    }

    const estadoNuevo: EstadoSim = tipo === "cartera" ? "Desactivada por cartera" : "Desactivada";
    const motivoTexto = tipo === "cartera" ? "por cartera (pago/facturación pendiente)" : "total (cliente solicitó cancelar el servicio)";
    const alcanceTexto = proveedores.length > 0 ? `solo ${proveedores.join(", ")}` : "todos los proveedores";

    const { data: operacion, error: errorOperacion } = await admin
      .from("bulk_operations")
      .insert({
        organization_id: profile.organization_id,
        tipo: "cambio_estado",
        estado_nuevo: estadoNuevo,
        cantidad_sims: sims.length,
        nota: `Desactivación de cliente "${clienteNombre.trim()}" — ${motivoTexto}. Alcance: ${alcanceTexto}.`,
        cliente_nombre: clienteNombre.trim(),
        tipo_desactivacion: tipo,
        proveedores_incluidos: proveedores.length > 0 ? proveedores : null,
        created_by: userId,
      })
      .select("id")
      .single();

    if (errorOperacion) return { error: errorOperacion.message };
    const operacionId = operacion.id as string;

    const filas = sims.map((s) => ({
      sim_id: s.id,
      estado: estadoNuevo,
      estado_anterior: s.estado_actual, // clave: así cada una vuelve a lo suyo al reactivar
      bulk_operation_id: operacionId,
      changed_by: userId,
      nota: `Desactivación masiva de cliente (${tipo === "cartera" ? "por cartera" : "total"}).`,
    }));

    const { error: errorInsert } = await admin.from("sim_status_history").insert(filas);
    if (errorInsert) return { error: errorInsert.message };

    // El registro del cliente en sí solo se toca cuando se desactivaron
    // TODOS sus proveedores — si solo se desactivó uno (ej. solo Claro),
    // el cliente sigue con servicio activo por los demás.
    //
    // "Total" (canceló del todo) → el cliente pasa a Inactivo de verdad.
    // "Cartera" (atraso en pago) → el cliente SIGUE Activo como cliente
    // (la relación comercial sigue viva), solo se marca que tiene
    // operadores cortados por cartera — no es lo mismo que haberse ido.
    if (proveedores.length === 0) {
      const { error: errorCliente, data: filasActualizadas } = await admin
        .from("clientes")
        .update({ active: tipo === "cartera", motivo_desactivacion: tipo })
        .eq("organization_id", profile.organization_id)
        .eq("nombre", clienteNombre.trim())
        .select("id");
      // No se detiene la operación por esto (las SIM ya quedaron
      // desactivadas, que es lo principal) — pero si falla, se avisa en
      // vez de quedar en silencio como antes.
      if (errorCliente) {
        return { ok: true, cantidad: sims.length, avisoCliente: `Las SIM quedaron desactivadas, pero no se pudo actualizar el estado del cliente: ${errorCliente.message}` };
      }
      if (!filasActualizadas || filasActualizadas.length === 0) {
        return { ok: true, cantidad: sims.length, avisoCliente: `Las SIM quedaron desactivadas, pero no se encontró el registro del cliente "${clienteNombre.trim()}" para actualizar su estado.` };
      }
    }

    revalidatePath(`/dashboard/clientes/${encodeURIComponent(clienteNombre)}`);
    revalidatePath("/dashboard/clientes");
    revalidatePath("/dashboard/inventario");
    revalidatePath("/dashboard/alertas");

    return { ok: true, cantidad: sims.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo desactivar al cliente. Intenta de nuevo." };
  }
}

/** Busca si el cliente tiene una desactivación vigente (sin revertir). */
export async function buscarDesactivacionVigente(clienteNombre: string): Promise<DesactivacionVigente | null> {
  const { profile } = await getCurrentProfile();
  const admin = createAdminClient();
  const { data } = await admin
    .from("bulk_operations")
    .select("id, tipo_desactivacion, proveedores_incluidos, cantidad_sims, nota, created_at, created_by")
    .eq("organization_id", profile.organization_id)
    .eq("cliente_nombre", clienteNombre.trim())
    .is("revertida_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as DesactivacionVigente | null) ?? null;
}

/** Reactiva al cliente: cada SIM vuelve exactamente al estado que tenía
 *  antes de la desactivación (reutiliza revertirOperacionMasiva, que ya
 *  hace esto para cualquier operación masiva). */
export async function reactivarCliente(operacionId: string) {
  try {
    const { userId, profile } = await getCurrentProfile();
    if (!tieneModulo(profile, "clientes")) {
      return { error: "No tienes acceso al módulo de Clientes." };
    }

    const admin = createAdminClient();
    const { data: operacion } = await admin
      .from("bulk_operations")
      .select("id, organization_id, cliente_nombre, revertida_at, proveedores_incluidos")
      .eq("id", operacionId)
      .maybeSingle();

    if (!operacion) return { error: "No se encontró esa desactivación." };
    if (operacion.organization_id !== profile.organization_id) return { error: "No se encontró esa desactivación." };
    if (!operacion.cliente_nombre) return { error: "Esta operación no es una desactivación de cliente." };
    if (operacion.revertida_at) return { error: "Este cliente ya había sido reactivado." };

    // 1) Cada SIM vuelve a su estado individual anterior.
    const { data: filasAfectadas } = await admin
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
        nota: `Reactivación del cliente "${operacion.cliente_nombre}" — vuelve a su estado anterior a la desactivación.`,
      }));

    if (filasRevertir.length > 0) {
      const { error: errorRevertir } = await admin.from("sim_status_history").insert(filasRevertir);
      if (errorRevertir) return { error: errorRevertir.message };
    }

    const { error: errorMarcar } = await admin
      .from("bulk_operations")
      .update({ revertida_at: new Date().toISOString(), revertida_by: userId })
      .eq("id", operacionId);
    if (errorMarcar) return { error: errorMarcar.message };

    // Si esta desactivación había sido de TODOS los proveedores (la única
    // que marca al cliente en sí como desactivado), se le vuelve a marcar
    // como Activo.
    const fueTodosLosProveedores = !operacion.proveedores_incluidos || (operacion.proveedores_incluidos as string[]).length === 0;
    let avisoCliente: string | undefined;
    if (fueTodosLosProveedores) {
      const { error: errorCliente, data: filasActualizadas } = await admin
        .from("clientes")
        .update({ active: true, motivo_desactivacion: null })
        .eq("organization_id", profile.organization_id)
        .eq("nombre", operacion.cliente_nombre)
        .select("id");
      if (errorCliente) avisoCliente = `Las SIM se reactivaron, pero no se pudo actualizar el estado del cliente: ${errorCliente.message}`;
      else if (!filasActualizadas || filasActualizadas.length === 0) avisoCliente = `Las SIM se reactivaron, pero no se encontró el registro del cliente "${operacion.cliente_nombre}" para actualizar su estado.`;
    }

    revalidatePath(`/dashboard/clientes/${encodeURIComponent(operacion.cliente_nombre)}`);
    revalidatePath("/dashboard/clientes");
    revalidatePath("/dashboard/inventario");
    revalidatePath("/dashboard/alertas");

    return { ok: true, reactivadas: filasRevertir.length, avisoCliente };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo reactivar al cliente. Intenta de nuevo." };
  }
}
