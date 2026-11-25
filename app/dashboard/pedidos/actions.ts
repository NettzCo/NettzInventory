"use server";

import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tieneModulo } from "@/lib/modules";
import { revalidatePath } from "next/cache";
import type { Pedido, PedidoEnvio } from "@/lib/types";
import { ESTADOS_SIM } from "@/lib/types";

export interface PedidoInput {
  cliente_id: string;
  cliente_nombre: string;
  cantidad: string; // viene del formulario como texto
  proveedor: string;
  apn: string;
  pais: string;
  ciudad: string;
  direccion: string;
  contacto_nombre: string;
  contacto_telefono: string;
  contacto_correo: string;
  asignado_a: string;
  observaciones: string;
}

function validarPedido(input: PedidoInput): string | null {
  const cantidadNum = Number(input.cantidad);
  if (
    !input.cliente_nombre.trim() ||
    !cantidadNum ||
    cantidadNum <= 0 ||
    !input.proveedor ||
    !input.pais.trim() ||
    !input.ciudad.trim() ||
    !input.direccion.trim() ||
    !input.contacto_nombre.trim() ||
    !input.contacto_telefono.trim() ||
    !input.asignado_a
  ) {
    return "Faltan campos obligatorios del pedido.";
  }
  return null;
}

export async function crearPedido(input: PedidoInput) {
  try {
    const { userId, profile } = await getCurrentProfile();

    if (!tieneModulo(profile, "pedidos")) {
      return { error: "No tienes acceso al módulo de Pedidos." };
    }

    const validacion = validarPedido(input);
    if (validacion) return { error: validacion };

    const supabase = await createClient();
    const { data: creado, error } = await supabase.from("pedidos").insert({
      organization_id: profile.organization_id,
      cliente_id: input.cliente_id || null,
      cliente_nombre: input.cliente_nombre.trim(),
      cantidad: Number(input.cantidad),
      proveedor: input.proveedor,
      apn: input.apn || null,
      pais: input.pais.trim(),
      ciudad: input.ciudad.trim(),
      direccion: input.direccion.trim(),
      contacto_nombre: input.contacto_nombre.trim(),
      contacto_telefono: input.contacto_telefono.trim(),
      contacto_correo: input.contacto_correo.trim() || null,
      asignado_a: input.asignado_a,
      observaciones: input.observaciones.trim() || null,
      created_by: userId,
    }).select("*").single();

    if (error) return { error: error.message };

    revalidatePath("/dashboard/pedidos");
    revalidatePath("/dashboard/alertas");
    return { ok: true, pedido: creado as Pedido };
  } catch (e) {
    // Nunca dejamos que esto falle en silencio: cualquier error inesperado
    // (sesión vencida, problema de conexión, etc.) siempre vuelve como un
    // mensaje visible en pantalla, en vez de simplemente "no pasar nada".
    return { error: e instanceof Error ? e.message : "No se pudo registrar el pedido. Intenta de nuevo." };
  }
}

export async function editarPedido(id: string, input: PedidoInput) {
  try {
    const { userId, profile } = await getCurrentProfile();
    if (!tieneModulo(profile, "pedidos")) {
      return { error: "No tienes acceso al módulo de Pedidos." };
    }

    const validacion = validarPedido(input);
    if (validacion) return { error: validacion };

    const supabase = await createClient();
    const { data: pedido } = await supabase.from("pedidos").select("created_by, estado").eq("id", id).maybeSingle();
    if (!pedido) return { error: "No se encontró el pedido." };
    if (pedido.created_by !== userId && !profile.role_es_sistema) {
      return { error: "Solo quien creó este pedido puede editarlo." };
    }

    const { error } = await supabase
      .from("pedidos")
      .update({
        cliente_id: input.cliente_id || null,
        cliente_nombre: input.cliente_nombre.trim(),
        cantidad: Number(input.cantidad),
        proveedor: input.proveedor,
        apn: input.apn || null,
        pais: input.pais.trim(),
        ciudad: input.ciudad.trim(),
        direccion: input.direccion.trim(),
        contacto_nombre: input.contacto_nombre.trim(),
        contacto_telefono: input.contacto_telefono.trim(),
        contacto_correo: input.contacto_correo.trim() || null,
        asignado_a: input.asignado_a,
        observaciones: input.observaciones.trim() || null,
        // Si estaba rechazado, al editarlo vuelve a quedar pendiente — se
        // asume que se corrigió lo que causó el rechazo y se reintenta.
        ...(pedido.estado === "Rechazado"
          ? { estado: "Pendiente", motivo_rechazo: null, rechazado_at: null, rechazado_by: null, visto_at: null }
          : {}),
      })
      .eq("id", id);

    if (error) return { error: error.message };

    revalidatePath("/dashboard/pedidos");
    revalidatePath("/dashboard/alertas");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo editar el pedido. Intenta de nuevo." };
  }
}

export async function eliminarPedido(id: string) {
  try {
    const { userId, profile } = await getCurrentProfile();
    if (!tieneModulo(profile, "pedidos")) {
      return { error: "No tienes acceso al módulo de Pedidos." };
    }

    const supabase = await createClient();
    const { data: pedido } = await supabase.from("pedidos").select("created_by").eq("id", id).maybeSingle();
    if (!pedido) return { error: "No se encontró el pedido." };
    if (pedido.created_by !== userId && !profile.role_es_sistema) {
      return { error: "Solo quien creó este pedido puede eliminarlo." };
    }

    const { error } = await supabase.from("pedidos").delete().eq("id", id);
    if (error) return { error: error.message };

    revalidatePath("/dashboard/pedidos");
    revalidatePath("/dashboard/alertas");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo eliminar el pedido. Intenta de nuevo." };
  }
}

export interface EnvioInput {
  fecha_envio: string; // yyyy-mm-dd
  transportadora: string;
  numero_guia: string;
  valor_envio: string; // texto del formulario, en pesos (COP); "" = sin valor
  iccs: string; // ICC separados por salto de línea, coma, punto y coma o espacio
  plan?: PlanClienteInput; // obligatorio cuando hay ICC nuevos: es con lo que se crea la asignación al cliente
}

// Datos del plan con los que las SIM quedan asignadas al cliente en el inventario
// (los mismos que pide "Registrar entrega").
export interface PlanClienteInput {
  plan_unidad: string;
  plan_cantidad: string;
  tipo_plan: string;
  duracion_meses: string; // "" cuando es Postpago
  pago_momento: string;
  precio_cliente: string;
  comercial_id: string;
  estado_inicial: string;
}

function parsearIccs(texto: string): string[] {
  return Array.from(new Set(texto.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)));
}

function parsearValor(texto: string): number | null | "invalido" {
  const limpio = texto.replace(/[^\d.,-]/g, "").trim();
  if (!limpio) return null;
  // Acepta "12500", "12.500" y "12,500" (puntos o comas de miles) como 12500.
  const n = Number(limpio.replace(/[.,](?=\d{3}(\D|$))/g, ""));
  return Number.isNaN(n) || n < 0 ? "invalido" : n;
}

async function prepararEnvio(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  input: EnvioInput,
  excluirEnvioId?: string
): Promise<{ error: string } | { fila: { fecha_envio: string; transportadora: string | null; numero_guia: string | null; valor_envio: number | null; iccs: string[] } }> {
  if (!input.fecha_envio) return { error: "Indica la fecha de envío." };
  const valor = parsearValor(input.valor_envio);
  if (valor === "invalido") return { error: "El valor del envío debe ser un número mayor o igual a cero." };

  const iccs = parsearIccs(input.iccs);
  if (iccs.length > 0) {
    // 1) Formato razonable (evita espacios o símbolos por error de copiado).
    const malos = iccs.filter((i) => !/^[0-9A-Za-z]{8,25}$/.test(i));
    if (malos.length > 0) {
      return { error: `Estos ICC no tienen un formato válido: ${malos.slice(0, 5).join(", ")}. Solo letras y números, sin espacios.` };
    }

    // 2) Un ICC no puede aparecer en dos envíos distintos.
    let consulta = supabase.from("pedido_envios").select("iccs").eq("organization_id", organizationId).overlaps("iccs", iccs);
    if (excluirEnvioId) consulta = consulta.neq("id", excluirEnvioId);
    const { data: repetidos, error: e2 } = await consulta;
    if (e2) return { error: e2.message };
    if (repetidos && repetidos.length > 0) {
      const ya = new Set(repetidos.flatMap((r) => r.iccs as string[]));
      const repetidosLista = iccs.filter((i) => ya.has(i)).slice(0, 5).join(", ");
      return { error: `Estos ICC ya están registrados en otro envío: ${repetidosLista}.` };
    }
  }

  return {
    fila: {
      fecha_envio: new Date(`${input.fecha_envio}T12:00:00-05:00`).toISOString(),
      transportadora: input.transportadora.trim() || null,
      numero_guia: input.numero_guia.trim() || null,
      valor_envio: valor,
      iccs,
    },
  };
}

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

// Deja las SIM asignadas al cliente del pedido, directamente en el inventario:
// si el ICC no existe se crea (con el proveedor y APN del pedido); si ya existe
// y está libre, solo se le asigna el cliente y el plan. Si alguna ya está
// asignada a un cliente, no se toca nada. Todo o nada: ante cualquier error se
// revierte lo que se alcanzó a crear.
async function asignarSimsACliente(
  supabase: SupabaseServer,
  ctx: { userId: string; organizationId: string; clienteNombre: string; proveedor: string; apn: string | null; fechaEntrega: string },
  iccs: string[],
  plan: PlanClienteInput | undefined
): Promise<{ error: string } | { ok: true; operacionId: string }> {
  if (!plan) return { error: "Indica el plan del cliente para poder asignarle las SIM en el inventario." };
  const cantidad = Number(plan.plan_cantidad);
  const precio = Number(plan.precio_cliente);
  if (!plan.plan_unidad || !plan.tipo_plan || !plan.pago_momento || !plan.comercial_id || !(cantidad > 0) || plan.precio_cliente === "" || Number.isNaN(precio) || precio < 0) {
    return { error: "Completa el plan del cliente: unidad, cantidad, tipo, pago, precio y comercial." };
  }
  if (!ESTADOS_SIM.includes(plan.estado_inicial as (typeof ESTADOS_SIM)[number])) {
    return { error: "El estado inicial de las SIM no es válido." };
  }

  const { data: existentes, error: e1 } = await supabase
    .from("sim_cards")
    .select("id, icc")
    .eq("organization_id", ctx.organizationId)
    .in("icc", iccs);
  if (e1) return { error: e1.message };
  const idPorIcc = new Map<string, string>((existentes ?? []).map((r) => [r.icc as string, r.id as string]));

  if (idPorIcc.size > 0) {
    const { data: vigentes, error: e2 } = await supabase
      .from("sim_assignments")
      .select("sim_id, cliente_nombre")
      .in("sim_id", [...idPorIcc.values()])
      .is("ended_at", null);
    if (e2) return { error: e2.message };
    if (vigentes && vigentes.length > 0) {
      const iccDe = new Map([...idPorIcc.entries()].map(([icc, id]) => [id, icc]));
      const lista = vigentes.slice(0, 5).map((v) => `${iccDe.get(v.sim_id as string)} (${v.cliente_nombre})`).join(", ");
      return { error: `Estas SIM ya están asignadas a un cliente: ${lista}. Para moverlas usa Gestión de SIMs.` };
    }
  }

  const { data: operacion, error: eOp } = await supabase
    .from("bulk_operations")
    .insert({
      organization_id: ctx.organizationId,
      tipo: "registro_entrega",
      cantidad_sims: iccs.length,
      nota: `Pedido enviado a ${ctx.clienteNombre} (${iccs.length} SIM)`,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (eOp || !operacion) return { error: eOp?.message ?? "No se pudo registrar la operación." };
  const operacionId = operacion.id as string;

  const creadas: string[] = [];
  async function revertir(mensaje: string) {
    await supabase.from("sim_assignments").delete().eq("bulk_operation_id", operacionId);
    if (creadas.length > 0) await supabase.from("sim_cards").delete().in("id", creadas);
    await supabase.from("bulk_operations").delete().eq("id", operacionId);
    return { error: mensaje };
  }

  // 1) Crear las SIM que no existen.
  const nuevas = iccs.filter((i) => !idPorIcc.has(i));
  if (nuevas.length > 0) {
    const { data: creadasRows, error: e3 } = await supabase
      .from("sim_cards")
      .insert(nuevas.map((icc) => ({ organization_id: ctx.organizationId, icc, proveedor: ctx.proveedor, apn: ctx.apn, created_by: ctx.userId })))
      .select("id, icc");
    if (e3) return revertir(`No se pudieron crear las SIM en el inventario: ${e3.message}`);
    for (const r of creadasRows ?? []) {
      creadas.push(r.id as string);
      idPorIcc.set(r.icc as string, r.id as string);
    }
    const { error: e4 } = await supabase.from("sim_status_history").insert(
      creadas.map((simId) => ({
        sim_id: simId,
        estado: plan.estado_inicial,
        changed_by: ctx.userId,
        nota: "Estado inicial al enviar el pedido.",
        bulk_operation_id: operacionId,
      }))
    );
    if (e4) return revertir(`No se pudo registrar el estado de las SIM: ${e4.message}`);
  }

  // 2) Asignar el cliente y el plan a todas.
  const { error: e5 } = await supabase.from("sim_assignments").insert(
    iccs.map((icc) => ({
      sim_id: idPorIcc.get(icc)!,
      cliente_nombre: ctx.clienteNombre,
      plan_unidad: plan.plan_unidad,
      plan_cantidad: cantidad,
      tipo_plan: plan.tipo_plan,
      pago_momento: plan.pago_momento,
      duracion_meses: plan.tipo_plan === "Prepago" ? Number(plan.duracion_meses) || 12 : null,
      precio_cliente: precio,
      comercial_id: plan.comercial_id,
      broker_id: null,
      fecha_entrega: ctx.fechaEntrega,
      created_by: ctx.userId,
      bulk_operation_id: operacionId,
    }))
  );
  if (e5) return revertir(`No se pudo asignar el cliente y el plan a las SIM: ${e5.message}`);

  return { ok: true, operacionId };
}

// Registra un envío (una guía) de un pedido. Si el pedido estaba pendiente,
// pasa a "Enviado". Un pedido puede tener varios envíos (parciales o con
// distintas transportadoras).
export async function registrarEnvio(pedidoId: string, input: EnvioInput, comprobanteUrl: string | null) {
  try {
    const { userId, profile } = await getCurrentProfile();
    if (!tieneModulo(profile, "pedidos")) {
      return { error: "No tienes acceso al módulo de Pedidos." };
    }

    const supabase = await createClient();
    const { data: pedido } = await supabase
      .from("pedidos")
      .select("asignado_a, estado, comprobante_url, cliente_nombre, proveedor, apn")
      .eq("id", pedidoId)
      .maybeSingle();
    if (!pedido) return { error: "No se encontró el pedido." };
    if (pedido.asignado_a !== userId && !profile.role_es_sistema) {
      return { error: "Solo la persona asignada puede registrar envíos de este pedido." };
    }
    if (pedido.estado === "Rechazado") return { error: "Este pedido fue rechazado; no se le pueden registrar envíos." };

    const preparado = await prepararEnvio(supabase, profile.organization_id, input);
    if ("error" in preparado) return { error: preparado.error };

    const { data: envio, error } = await supabase
      .from("pedido_envios")
      .insert({
        organization_id: profile.organization_id,
        pedido_id: pedidoId,
        comprobante_url: comprobanteUrl,
        created_by: userId,
        ...preparado.fila,
      })
      .select("*")
      .single();
    if (error) return { error: error.message };

    // Si el envío trae ICC, las SIM quedan asignadas al cliente en el inventario.
    if (preparado.fila.iccs.length > 0) {
      if (!tieneModulo(profile, "inventario")) {
        await supabase.from("pedido_envios").delete().eq("id", envio.id);
        return { error: "Para asignar SIM al cliente necesitas acceso al módulo de Inventario." };
      }
      const asignacion = await asignarSimsACliente(
        supabase,
        {
          userId,
          organizationId: profile.organization_id,
          clienteNombre: pedido.cliente_nombre as string,
          proveedor: pedido.proveedor as string,
          apn: (pedido.apn as string | null) ?? null,
          fechaEntrega: input.fecha_envio,
        },
        preparado.fila.iccs,
        input.plan
      );
      if ("error" in asignacion) {
        await supabase.from("pedido_envios").delete().eq("id", envio.id);
        return { error: asignacion.error };
      }
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/inventario");
    }

    let pedidoPatch: Partial<Pedido> = {};
    if (pedido.estado === "Pendiente") {
      pedidoPatch = {
        estado: "Enviado",
        enviado_at: preparado.fila.fecha_envio,
        enviado_by: userId,
        comprobante_url: comprobanteUrl ?? pedido.comprobante_url,
      };
      const { error: errorPedido } = await supabase.from("pedidos").update(pedidoPatch).eq("id", pedidoId);
      if (errorPedido) return { error: errorPedido.message };
    }

    revalidatePath("/dashboard/pedidos");
    revalidatePath("/dashboard/alertas");
    return { ok: true, envio: envio as PedidoEnvio, pedidoPatch };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo registrar el envío. Intenta de nuevo." };
  }
}

export async function actualizarEnvio(envioId: string, input: EnvioInput, comprobanteUrl: string | null) {
  try {
    const { userId, profile } = await getCurrentProfile();
    if (!tieneModulo(profile, "pedidos")) {
      return { error: "No tienes acceso al módulo de Pedidos." };
    }

    const supabase = await createClient();
    const { data: envio } = await supabase.from("pedido_envios").select("id, pedido_id, iccs").eq("id", envioId).maybeSingle();
    if (!envio) return { error: "No se encontró el envío." };
    const { data: pedido } = await supabase
      .from("pedidos")
      .select("asignado_a, cliente_nombre, proveedor, apn")
      .eq("id", envio.pedido_id)
      .maybeSingle();
    if (!pedido || (pedido.asignado_a !== userId && !profile.role_es_sistema)) {
      return { error: "Solo la persona asignada puede editar los envíos de este pedido." };
    }

    const preparado = await prepararEnvio(supabase, profile.organization_id, input, envioId);
    if ("error" in preparado) return { error: preparado.error };

    // Las SIM que ya se asignaron al cliente no se quitan desde aquí; solo se pueden agregar nuevas.
    const anteriores = new Set<string>((envio.iccs as string[]) ?? []);
    const quitadas = [...anteriores].filter((i) => !preparado.fila.iccs.includes(i));
    if (quitadas.length > 0) {
      return { error: `Estas SIM ya están asignadas al cliente en el inventario y no se pueden quitar desde aquí: ${quitadas.slice(0, 5).join(", ")}. Para deshacerlo usa Gestión de SIMs.` };
    }
    const agregadas = preparado.fila.iccs.filter((i) => !anteriores.has(i));
    if (agregadas.length > 0) {
      if (!tieneModulo(profile, "inventario")) {
        return { error: "Para asignar SIM al cliente necesitas acceso al módulo de Inventario." };
      }
      const asignacion = await asignarSimsACliente(
        supabase,
        {
          userId,
          organizationId: profile.organization_id,
          clienteNombre: pedido.cliente_nombre as string,
          proveedor: pedido.proveedor as string,
          apn: (pedido.apn as string | null) ?? null,
          fechaEntrega: input.fecha_envio,
        },
        agregadas,
        input.plan
      );
      if ("error" in asignacion) return { error: asignacion.error };
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/inventario");
    }

    const { data: actualizado, error } = await supabase
      .from("pedido_envios")
      .update({ ...preparado.fila, ...(comprobanteUrl ? { comprobante_url: comprobanteUrl } : {}) })
      .eq("id", envioId)
      .select("*")
      .single();
    if (error) return { error: error.message };

    revalidatePath("/dashboard/pedidos");
    return { ok: true, envio: actualizado as PedidoEnvio };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el envío. Intenta de nuevo." };
  }
}

export async function eliminarEnvio(envioId: string) {
  try {
    const { userId, profile } = await getCurrentProfile();
    if (!tieneModulo(profile, "pedidos")) {
      return { error: "No tienes acceso al módulo de Pedidos." };
    }

    const supabase = await createClient();
    const { data: envio } = await supabase.from("pedido_envios").select("id, pedido_id, iccs").eq("id", envioId).maybeSingle();
    if (!envio) return { error: "No se encontró el envío." };
    const { data: pedido } = await supabase.from("pedidos").select("asignado_a").eq("id", envio.pedido_id).maybeSingle();
    if (!pedido || (pedido.asignado_a !== userId && !profile.role_es_sistema)) {
      return { error: "Solo la persona asignada puede quitar envíos de este pedido." };
    }
    if (((envio.iccs as string[]) ?? []).length > 0) {
      return { error: "Este envío tiene SIM asignadas al cliente en el inventario, por eso no se puede quitar. Deshaz primero esa entrega en Gestión de SIMs." };
    }

    const { error } = await supabase.from("pedido_envios").delete().eq("id", envioId);
    if (error) return { error: error.message };

    revalidatePath("/dashboard/pedidos");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo quitar el envío. Intenta de nuevo." };
  }
}

// Sube el comprobante (imagen o PDF) al storage y devuelve su URL pública.
// Se llama antes de marcarPedidoEnviado, desde el mismo formulario.
export async function subirComprobante(pedidoId: string, formData: FormData) {
  try {
    const { userId, profile } = await getCurrentProfile();
    if (!tieneModulo(profile, "pedidos")) {
      return { error: "No tienes acceso al módulo de Pedidos." };
    }

    const supabase = await createClient();
    const { data: pedido } = await supabase.from("pedidos").select("asignado_a").eq("id", pedidoId).maybeSingle();
    if (!pedido) return { error: "No se encontró el pedido." };
    if (pedido.asignado_a !== userId && !profile.role_es_sistema) {
      return { error: "Solo la persona asignada puede adjuntar el comprobante." };
    }

    const file = formData.get("file") as File | null;
    if (!file) return { error: "No se recibió ningún archivo." };
    if (file.size > 8 * 1024 * 1024) return { error: "El archivo no puede pesar más de 8 MB." };

    const extension = file.name.split(".").pop() || "bin";
    const ruta = `${profile.organization_id}/${pedidoId}/${Date.now()}.${extension}`;

    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from("pedidos-comprobantes")
      .upload(ruta, await file.arrayBuffer(), { contentType: file.type, upsert: true });

    if (uploadError) return { error: uploadError.message };

    const { data: urlData } = admin.storage.from("pedidos-comprobantes").getPublicUrl(ruta);
    return { ok: true, url: urlData.publicUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo subir el comprobante. Intenta de nuevo." };
  }
}

// Se marca automáticamente en el servidor cuando la persona asignada carga
// la página de Pedidos por primera vez desde que le llegó (no requiere que
// el usuario haga nada) — así el creador ve el doble check de "ya lo vio".
export async function marcarPedidoVisto(id: string) {
  try {
    const { userId } = await getCurrentProfile();
    const supabase = await createClient();
    const { data: pedido } = await supabase.from("pedidos").select("asignado_a, visto_at").eq("id", id).maybeSingle();
    if (!pedido || pedido.asignado_a !== userId || pedido.visto_at) return { ok: true };

    await supabase.from("pedidos").update({ visto_at: new Date().toISOString() }).eq("id", id);
    revalidatePath("/dashboard/pedidos");
    return { ok: true };
  } catch {
    return { ok: true }; // esto es informativo, nunca debe bloquear la carga de la página
  }
}

// Solo la persona asignada (o el super administrador) puede rechazar un
// pedido, y siempre debe indicar por qué — el motivo queda visible para
// quien lo creó, y el pedido deja de generarle alertas (queda resuelto).
export async function rechazarPedido(id: string, motivo: string) {
  try {
    const { userId, profile } = await getCurrentProfile();
    if (!tieneModulo(profile, "pedidos")) {
      return { error: "No tienes acceso al módulo de Pedidos." };
    }
    if (!motivo.trim()) {
      return { error: "Debes indicar el motivo del rechazo." };
    }

    const supabase = await createClient();
    const { data: pedido } = await supabase.from("pedidos").select("asignado_a").eq("id", id).maybeSingle();
    if (!pedido) return { error: "No se encontró el pedido." };
    if (pedido.asignado_a !== userId && !profile.role_es_sistema) {
      return { error: "Solo la persona asignada puede rechazar este pedido." };
    }

    const { error } = await supabase
      .from("pedidos")
      .update({
        estado: "Rechazado",
        motivo_rechazo: motivo.trim(),
        rechazado_at: new Date().toISOString(),
        rechazado_by: userId,
      })
      .eq("id", id);

    if (error) return { error: error.message };

    revalidatePath("/dashboard/pedidos");
    revalidatePath("/dashboard/alertas");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo rechazar el pedido. Intenta de nuevo." };
  }
}
