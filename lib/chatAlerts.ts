import { createClient } from "@/lib/supabase/server";
import { ChatMessage } from "@/lib/types";

export interface AlertaChat {
  conversacion: string; // "general" o el id del otro usuario
  esGeneral: boolean;
  nombreOtro: string;
  cantidad: number;
  ultimoMensaje: string;
  ultimaFecha: string;
}

export async function construirAlertasChat(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  organizationId: string
): Promise<AlertaChat[]> {
  const [{ data: mensajes }, { data: reads }, { data: perfiles }] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("*")
      .eq("organization_id", organizationId)
      .or(`recipient_id.is.null,recipient_id.eq.${userId}`)
      .neq("sender_id", userId)
      .order("created_at", { ascending: false }),
    supabase.from("chat_reads").select("*").eq("user_id", userId),
    supabase.from("profiles").select("id, full_name").eq("organization_id", organizationId),
  ]);

  const ultimaLectura: Record<string, string> = {};
  for (const r of reads ?? []) ultimaLectura[r.conversation] = r.last_read_at;

  const nombrePorId = new Map((perfiles ?? []).map((p) => [p.id, p.full_name]));

  const grupos: Record<string, ChatMessage[]> = {};
  for (const m of (mensajes ?? []) as ChatMessage[]) {
    const clave = m.recipient_id === null ? "general" : m.sender_id;
    if (!grupos[clave]) grupos[clave] = [];
    grupos[clave].push(m);
  }

  const alertas: AlertaChat[] = [];
  for (const [conversacion, lista] of Object.entries(grupos)) {
    const desde = ultimaLectura[conversacion];
    const noLeidos = desde ? lista.filter((m) => new Date(m.created_at) > new Date(desde)) : lista;
    if (noLeidos.length === 0) continue;

    alertas.push({
      conversacion,
      esGeneral: conversacion === "general",
      nombreOtro: conversacion === "general" ? "Canal general" : nombrePorId.get(conversacion) ?? "Usuario",
      cantidad: noLeidos.length,
      ultimoMensaje: noLeidos[0].body,
      ultimaFecha: noLeidos[0].created_at,
    });
  }

  return alertas.sort((a, b) => new Date(b.ultimaFecha).getTime() - new Date(a.ultimaFecha).getTime());
}
