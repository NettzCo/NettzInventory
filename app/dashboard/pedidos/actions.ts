"use server";

import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
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

export async function crearPedido(input: PedidoInput) {
  const { userId, profile } = await getCurrentProfile();

  if (!tieneModulo(profile, "pedidos")) {
    return { error: "No tienes acceso al módulo de Pedidos." };
  }

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
    return { error: "Faltan campos obligatorios del pedido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("pedidos").insert({
    organization_id: profile.organization_id,
    cliente_id: input.cliente_id || null,
    cliente_nombre: input.cliente_nombre.trim(),
    cantidad: cantidadNum,
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
}

export async function marcarPedidoEnviado(id: string) {
  const { userId, profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "pedidos")) {
    return { error: "No tienes acceso al módulo de Pedidos." };
  }

  const supabase = await createClient();

  // Solo la persona asignada (o el super administrador) puede confirmar el envío.
  const { data: pedido } = await supabase.from("pedidos").select("asignado_a").eq("id", id).maybeSingle();
  if (!pedido) return { error: "No se encontró el pedido." };
  if (pedido.asignado_a !== userId && !profile.role_es_sistema) {
    return { error: "Solo la persona asignada puede marcar este pedido como enviado." };
  }

  const { error } = await supabase
    .from("pedidos")
    .update({ estado: "Enviado", enviado_at: new Date().toISOString(), enviado_by: userId })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/pedidos");
  revalidatePath("/dashboard/alertas");
  return { ok: true };
}
