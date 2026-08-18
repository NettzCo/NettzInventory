"use server";

import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { tieneModulo } from "@/lib/modules";
import { revalidatePath } from "next/cache";

export async function enviarMensaje(recipientId: string | null, body: string) {
  const { userId, profile } = await getCurrentProfile();

  if (!tieneModulo(profile, "chat")) {
    return { error: "No tienes acceso al chat." };
  }
  if (!body.trim()) {
    return { error: "Escribe un mensaje." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("chat_messages").insert({
    organization_id: profile.organization_id,
    sender_id: userId,
    recipient_id: recipientId,
    body: body.trim(),
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/chat");
  revalidatePath("/dashboard/alertas");
  return { ok: true };
}

// "general" para el canal general, o el id del otro usuario para un directo.
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
