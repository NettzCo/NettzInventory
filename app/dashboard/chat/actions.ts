"use server";

import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tieneModulo } from "@/lib/modules";
import { revalidatePath } from "next/cache";

export interface AdjuntoChat {
  url: string;
  name: string;
  type: "image" | "file";
}

export async function enviarMensaje(
  recipientId: string | null,
  body: string,
  groupId: string | null = null,
  attachment: AdjuntoChat | null = null
) {
  const { userId, profile } = await getCurrentProfile();

  if (!tieneModulo(profile, "chat")) {
    return { error: "No tienes acceso al chat." };
  }
  if (!body.trim() && !attachment) {
    return { error: "Escribe un mensaje o adjunta un archivo." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("chat_messages").insert({
    organization_id: profile.organization_id,
    sender_id: userId,
    recipient_id: groupId ? null : recipientId,
    group_id: groupId,
    body: body.trim(),
    attachment_url: attachment?.url ?? null,
    attachment_name: attachment?.name ?? null,
    attachment_type: attachment?.type ?? null,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/chat");
  revalidatePath("/dashboard/alertas");
  return { ok: true };
}

// Sube el archivo arrastrado sobre el chat y devuelve su URL pública, para
// adjuntarlo al mensaje que se está a punto de enviar.
export async function subirAdjuntoChat(formData: FormData) {
  try {
    const { profile } = await getCurrentProfile();
    if (!tieneModulo(profile, "chat")) {
      return { error: "No tienes acceso al chat." };
    }

    const file = formData.get("file") as File | null;
    if (!file) return { error: "No se recibió ningún archivo." };
    if (file.size > 15 * 1024 * 1024) return { error: "El archivo no puede pesar más de 15 MB." };

    const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
    const ruta = `${profile.organization_id}/${crypto.randomUUID()}.${extension}`;

    const admin = createAdminClient();
    const { error } = await admin.storage
      .from("chat-adjuntos")
      .upload(ruta, await file.arrayBuffer(), { contentType: file.type || "application/octet-stream" });

    if (error) return { error: error.message };

    const { data: urlData } = admin.storage.from("chat-adjuntos").getPublicUrl(ruta);
    const tipo: "image" | "file" = file.type.startsWith("image/") ? "image" : "file";

    return { ok: true, url: urlData.publicUrl, name: file.name, type: tipo };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo subir el archivo. Intenta de nuevo." };
  }
}

// "general" para el canal general, el id del otro usuario para un directo,
// o "grupo:<id>" para un grupo.
export async function marcarChatLeido(conversation: string) {
  const { userId, profile } = await getCurrentProfile();
  const supabase = await createClient();

  await supabase.from("chat_reads").upsert({
    user_id: userId,
    conversation,
    last_read_at: new Date().toISOString(),
    organization_id: profile.organization_id,
  });

  revalidatePath("/dashboard/alertas");
  return { ok: true };
}

// ---------------------------------------------------------
// GRUPOS — cualquier usuario con acceso a Chat puede crear grupos y
// administrar los que creó (nombre y miembros). El super administrador
// administra todos. Los demás miembros solo escriben y leen.
// ---------------------------------------------------------
async function requireAdminDelGrupo(grupoId: string) {
  const { userId, profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "chat")) throw new Error("No tienes acceso al módulo de Chat.");
  const supabase = await createClient();
  const { data: grupo } = await supabase
    .from("chat_groups")
    .select("id, name, created_by")
    .eq("id", grupoId)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();
  if (!grupo) throw new Error("No se encontró el grupo.");
  if (grupo.created_by !== userId && !profile.role_es_sistema) {
    throw new Error("Solo quien creó el grupo o un super administrador puede administrarlo.");
  }
  return { userId, profile, supabase, grupo };
}

export async function crearGrupo(nombre: string, miembros: string[]) {
  try {
    const { userId, profile } = await getCurrentProfile();
    if (!tieneModulo(profile, "chat")) return { error: "No tienes acceso al módulo de Chat." };
    if (!nombre.trim()) return { error: "Ponle un nombre al grupo." };
    // Quien crea el grupo siempre queda dentro, para poder verlo y administrarlo.
    const ids = Array.from(new Set([...miembros, userId]));
    if (ids.length < 2) return { error: "Selecciona al menos una persona más para el grupo." };

    const supabase = await createClient();
    const { data: grupo, error } = await supabase
      .from("chat_groups")
      .insert({ organization_id: profile.organization_id, name: nombre.trim(), created_by: userId })
      .select("id")
      .single();

    if (error) return { error: error.message };

    const { error: errorMiembros } = await supabase
      .from("chat_group_members")
      .insert(ids.map((uid) => ({ group_id: grupo.id, user_id: uid })));

    if (errorMiembros) return { error: errorMiembros.message };

    revalidatePath("/dashboard/chat");
    return { ok: true, id: grupo.id as string };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo crear el grupo. Intenta de nuevo." };
  }
}

export async function editarGrupo(id: string, nombre: string, miembros: string[]) {
  try {
    const { profile, supabase, grupo } = await requireAdminDelGrupo(id);
    if (!nombre.trim()) return { error: "Ponle un nombre al grupo." };

    // El creador del grupo no se puede quitar a sí mismo ni lo puede quitar
    // otra persona que no sea super administrador.
    const deseados = new Set<string>(miembros);
    if (!profile.role_es_sistema) deseados.add(grupo.created_by);
    if (deseados.size === 0) return { error: "Selecciona al menos una persona para el grupo." };

    const { data: actuales, error: errorLectura } = await supabase
      .from("chat_group_members")
      .select("user_id")
      .eq("group_id", id);
    if (errorLectura) return { error: errorLectura.message };

    const actualesIds = new Set<string>((actuales ?? []).map((m) => m.user_id as string));
    const aAgregar = [...deseados].filter((u) => !actualesIds.has(u));
    const aQuitar = [...actualesIds].filter((u) => !deseados.has(u));

    if (nombre.trim() !== grupo.name) {
      const { error } = await supabase.from("chat_groups").update({ name: nombre.trim() }).eq("id", id);
      if (error) return { error: error.message };
    }

    // Se agrega primero y se quita después, y solo lo que cambia: así un
    // fallo a medias nunca deja el grupo vacío ni borra miembros de más.
    if (aAgregar.length > 0) {
      const { error } = await supabase.from("chat_group_members").insert(aAgregar.map((uid) => ({ group_id: id, user_id: uid })));
      if (error) return { error: error.message };
    }
    if (aQuitar.length > 0) {
      const { error } = await supabase.from("chat_group_members").delete().eq("group_id", id).in("user_id", aQuitar);
      if (error) return { error: error.message };
    }

    revalidatePath("/dashboard/chat");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo editar el grupo. Intenta de nuevo." };
  }
}

export async function eliminarGrupo(id: string) {
  try {
    const { supabase } = await requireAdminDelGrupo(id);
    const { error } = await supabase.from("chat_groups").delete().eq("id", id);
    if (error) return { error: error.message };

    revalidatePath("/dashboard/chat");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo eliminar el grupo. Intenta de nuevo." };
  }
}

// La búsqueda no necesita ninguna comprobación extra de permisos: como se
// usa el cliente normal (no el administrativo), la base de datos ya filtra
// sola — solo devuelve mensajes que el usuario tendría permiso de leer de
// todas formas (general, sus directos, o los grupos a los que pertenece).
export async function buscarMensajesChat(termino: string) {
  if (!termino.trim()) return { resultados: [] };

  const { profile } = await getCurrentProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .ilike("body", `%${termino.trim()}%`)
    .order("created_at", { ascending: false })
    .limit(30);

  return { resultados: data ?? [] };
}
