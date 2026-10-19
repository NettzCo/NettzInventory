"use server";

import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tieneModulo } from "@/lib/modules";
import { revalidatePath } from "next/cache";

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
    const { error } = await supabase.from("pedidos").insert({
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
    });

    if (error) return { error: error.message };

    revalidatePath("/dashboard/pedidos");
    revalidatePath("/dashboard/alertas");
    return { ok: true };
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

export async function marcarPedidoEnviado(id: string, fechaEnvio: string, comprobanteUrl: string | null) {
  try {
    const { userId, profile } = await getCurrentProfile();
    if (!tieneModulo(profile, "pedidos")) {
      return { error: "No tienes acceso al módulo de Pedidos." };
    }

    const supabase = await createClient();
    const { data: pedido } = await supabase.from("pedidos").select("asignado_a").eq("id", id).maybeSingle();
    if (!pedido) return { error: "No se encontró el pedido." };
    if (pedido.asignado_a !== userId && !profile.role_es_sistema) {
      return { error: "Solo la persona asignada puede marcar este pedido como enviado." };
    }
    if (!fechaEnvio) return { error: "Indica la fecha de envío." };

    const { error } = await supabase
      .from("pedidos")
      .update({
        estado: "Enviado",
        enviado_at: new Date(fechaEnvio).toISOString(),
        enviado_by: userId,
        comprobante_url: comprobanteUrl,
      })
      .eq("id", id);

    if (error) return { error: error.message };

    revalidatePath("/dashboard/pedidos");
    revalidatePath("/dashboard/alertas");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo confirmar el envío. Intenta de nuevo." };
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
