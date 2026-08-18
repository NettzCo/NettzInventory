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
  const [seleccion, setSeleccion] = useState<string | null>(conversacionInicial);
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
          const nuevo = payload.new as ChatMessage;
          setMensajes((prev) => [...prev, nuevo]);
        }
      )
      .subscribe();

    return () => {
      activo = false;
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccion, organizationId, currentUserId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  useEffect(() => {
    void marcarChatLeido(seleccion ?? "general");
  }, [seleccion, mensajes.length]);

  const mensajesVisibles = mensajes.filter(esRelevante);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cuerpo = texto.trim();
    if (!cuerpo) return;
    setTexto("");
    startTransition(async () => {
      await enviarMensaje(seleccion, cuerpo);
    });
  }

  return (
    <div className="flex rounded-xl border bg-white overflow-hidden" style={{ borderColor: "var(--border)", height: "calc(100vh - 180px)" }}>
      <div className="w-64 flex-shrink-0 border-r overflow-y-auto" style={{ borderColor: "var(--border)" }}>
        <button
          onClick={() => setSeleccion(null)}
          className="w-full text-left px-4 py-3 text-sm border-b flex items-center gap-2"
          style={{
            borderColor: "var(--border)",
            background: seleccion === null ? "var(--bg)" : "transparent",
            fontWeight: seleccion === null ? 600 : 400,
          }}
        >
          <span className="w-2 h-2 rounded-full" style={{ background: "var(--chip-gold)" }} />
          Canal general
        </button>
        {contactos.map((c) => (
          <button
            key={c.id}
            onClick={() => setSeleccion(c.id)}
            className="w-full text-left px-4 py-3 text-sm border-b"
            style={{
              borderColor: "var(--border)",
              background: seleccion === c.id ? "var(--bg)" : "transparent",
              fontWeight: seleccion === c.id ? 600 : 400,
            }}
          >
            {c.full_name}
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
          <p className="font-medium text-sm">{seleccion === null ? "Canal general" : nombrePorId.get(seleccion) ?? "Usuario"}</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {seleccion === null ? "Visible para todos en tu organización" : "Mensaje directo"} · el historial nunca se borra
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
          {cargando ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Cargando…</p>
          ) : mensajesVisibles.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Todavía no hay mensajes aquí.</p>
          ) : (
            mensajesVisibles.map((m) => {
              const propio = m.sender_id === currentUserId;
              return (
                <div key={m.id} className={`flex flex-col ${propio ? "items-end" : "items-start"}`}>
                  <div
                    className="rounded-xl px-3.5 py-2 text-sm max-w-md"
                    style={{
                      background: propio ? "var(--ink-900)" : "var(--bg)",
                      color: propio ? "white" : "var(--text-primary)",
                    }}
                  >
                    {m.body}
                  </div>
                  <span className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    {nombreDe(m.sender_id)} · {new Date(m.created_at).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSubmit} className="p-4 border-t flex gap-3" style={{ borderColor: "var(--border)" }}>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={seleccion === null ? "Escribe al canal general…" : `Escribe a ${nombrePorId.get(seleccion) ?? "este usuario"}…`}
            className="flex-1 rounded-lg border px-3.5 py-2.5 text-sm outline-none"
            style={{ borderColor: "var(--border)" }}
          />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--ink-900)" }}
          >
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
}
