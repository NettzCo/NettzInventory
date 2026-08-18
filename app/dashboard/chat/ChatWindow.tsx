"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChatMessage } from "@/lib/types";
import { enviarMensaje, marcarChatLeido } from "./actions";

interface Contacto {
  id: string;
  full_name: string;
}

// Convierte "Clara Londoño" en "ClaraLondoño" — así se escribe la mención,
// sin espacios pero conservando tildes/ñ, tal como se pidió.
function tokenDeNombre(nombre: string): string {
  return nombre.replace(/\s+/g, "");
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  const [otroLeidoHasta, setOtroLeidoHasta] = useState<string | null>(null);
  const [mencionActiva, setMencionActiva] = useState<{ inicio: number; filtro: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

  // Marca como leída la conversación abierta — tanto al entrar como cada
  // vez que llega un mensaje nuevo mientras la tienes abierta en pantalla.
  useEffect(() => {
    void marcarChatLeido(seleccion ?? "general");
  }, [seleccion, mensajes.length]);

  // Doble check: en un directo, verifica hasta cuándo ha leído el OTRO
  // usuario (no la propia lectura), y se actualiza al instante si él la
  // marca mientras tienes la conversación abierta.
  useEffect(() => {
    if (seleccion === null) { setOtroLeidoHasta(null); return; }
    const supabase = createClient();
    let activo = true;

    async function cargarLectura() {
      const { data } = await supabase
        .from("chat_reads")
        .select("last_read_at")
        .eq("user_id", seleccion as string)
        .eq("conversation", currentUserId)
        .maybeSingle();
      if (activo) setOtroLeidoHasta(data?.last_read_at ?? null);
    }
    cargarLectura();

    const canal = supabase
      .channel(`lectura-${seleccion}-${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_reads", filter: `user_id=eq.${seleccion}` },
        () => { void cargarLectura(); }
      )
      .subscribe();

    return () => {
      activo = false;
      supabase.removeChannel(canal);
    };
  }, [seleccion, currentUserId]);

  const mensajesVisibles = mensajes.filter(esRelevante);

  // ---------- Menciones @Nombre ----------
  const contactosOrdenados = useMemo(
    () => [...contactos].sort((a, b) => tokenDeNombre(b.full_name).length - tokenDeNombre(a.full_name).length),
    [contactos]
  );

  const regexMenciones = useMemo(() => {
    if (contactosOrdenados.length === 0) return null;
    const patron = contactosOrdenados.map((c) => escaparRegex(tokenDeNombre(c.full_name))).join("|");
    return new RegExp(`@(${patron})`, "g");
  }, [contactosOrdenados]);

  function renderBody(body: string) {
    if (!regexMenciones) return body;
    const partes = body.split(regexMenciones);
    return partes.map((parte, i) =>
      i % 2 === 1 ? (
        <span key={i} className="font-semibold" style={{ color: "var(--chip-gold)" }}>@{parte}</span>
      ) : (
        parte
      )
    );
  }

  const sugerencias = mencionActiva
    ? contactos.filter((c) => tokenDeNombre(c.full_name).toLowerCase().startsWith(mencionActiva.filtro.toLowerCase())).slice(0, 5)
    : [];

  function handleTextoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const valor = e.target.value;
    const caret = e.target.selectionStart ?? valor.length;
    setTexto(valor);

    const hastaCaret = valor.slice(0, caret);
    const match = hastaCaret.match(/@([^\s@]*)$/);
    if (match) {
      setMencionActiva({ inicio: caret - match[0].length, filtro: match[1] });
    } else {
      setMencionActiva(null);
    }
  }

  function elegirMencion(c: Contacto) {
    if (!mencionActiva) return;
    const token = tokenDeNombre(c.full_name);
    const antes = texto.slice(0, mencionActiva.inicio);
    const despues = texto.slice(mencionActiva.inicio + 1 + mencionActiva.filtro.length);
    setTexto(`${antes}@${token} ${despues}`);
    setMencionActiva(null);
    inputRef.current?.focus();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cuerpo = texto.trim();
    if (!cuerpo) return;
    setTexto("");
    setMencionActiva(null);
    startTransition(async () => {
      await enviarMensaje(seleccion, cuerpo);
    });
  }

  return (
    <div className="flex rounded-xl border bg-white overflow-hidden" style={{ borderColor: "var(--border)", height: "calc(100vh - 180px)" }}>
      {/* Lista de conversaciones */}
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

      {/* Conversación */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
          <p className="font-medium text-sm">{seleccion === null ? "Canal general" : nombrePorId.get(seleccion) ?? "Usuario"}</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {seleccion === null ? "Visible para todos en tu organización" : "Mensaje directo"} · el historial nunca se borra
            {seleccion === null && " · escribe @ para mencionar a alguien"}
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
                    {renderBody(m.body)}
                  </div>
                  <span className="text-xs mt-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                    {nombreDe(m.sender_id)} · {new Date(m.created_at).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {propio && seleccion !== null && (
                      <span
                        title={otroLeidoHasta && new Date(otroLeidoHasta) >= new Date(m.created_at) ? "Leído" : "Enviado"}
                        style={{ color: otroLeidoHasta && new Date(otroLeidoHasta) >= new Date(m.created_at) ? "var(--chip-gold)" : "var(--text-muted)" }}
                      >
                        {otroLeidoHasta && new Date(otroLeidoHasta) >= new Date(m.created_at) ? "✓✓" : "✓"}
                      </span>
                    )}
                  </span>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSubmit} className="p-4 border-t flex gap-3 relative" style={{ borderColor: "var(--border)" }}>
          {sugerencias.length > 0 && (
            <div
              className="absolute rounded-lg border bg-white shadow-lg overflow-hidden z-10"
              style={{ borderColor: "var(--border)", bottom: "calc(100% + 4px)", left: "1rem", minWidth: "12rem" }}
            >
              {sugerencias.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => elegirMencion(c)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg)]"
                >
                  {c.full_name}
                </button>
              ))}
            </div>
          )}
          <input
            ref={inputRef}
            value={texto}
            onChange={handleTextoChange}
            placeholder={seleccion === null ? "Escribe al canal general… (usa @ para mencionar)" : `Escribe a ${nombrePorId.get(seleccion) ?? "este usuario"}…`}
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
