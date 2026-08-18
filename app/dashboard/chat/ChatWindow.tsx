"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChatMessage } from "@/lib/types";
import { enviarMensaje, marcarChatLeido } from "./actions";

interface Contacto {
  id: string;
  full_name: string;
}

export default function ChatWindow({
  currentUserId,
  organizationId,
  contactos,
  conversacionInicial = null,
}: {
  currentUserId: string;
  organizationId: string;
  contactos: Contacto[];
  conversacionInicial?: string | null;
}) {
  const [seleccion, setSeleccion] = useState<string | null>(conversacionInicial); // null = canal general
  const [mensajes, setMensajes] = useState<ChatMessage[]>([]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(true);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const nombrePorId = new Map(contactos.map((c) => [c.id, c.full_name]));

  function nombreDe(id: string) {
    if (id === currentUserId) return "Tú";
    return nombrePorId.get(id) ?? "Usuario";
  }

  function esRelevante(msg: ChatMessage) {
    if (seleccion === null) return msg.recipient_id === null;
    return (
      (msg.sender_id === currentUserId && msg.recipient_id === seleccion) ||
      (msg.sender_id === seleccion && msg.recipient_id === currentUserId)
    );
  }

  useEffect(() => {
    const supabase = createClient();
    let activo = true;

    async function cargar() {
      setCargando(true);
      let query = supabase
        .from("chat_messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(200);

      query = seleccion === null
        ? query.is("recipient_id", null)
        : query.or(
            `and(sender_id.eq.${currentUserId},recipient_id.eq.${seleccion}),and(sender_id.eq.${seleccion},recipient_id.eq.${currentUserId})`
          );

      const { data } = await query;
      if (activo) {
        setMensajes((data ?? []) as ChatMessage[]);
        setCargando(false);
      }
    }
    cargar();

    const canal = supabase
      .channel(`chat-${organizationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `organization_id=eq.${organizationId}` },
        (payload) => {
          const nuevo = payload.new as
