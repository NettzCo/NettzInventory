"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AlertaChat } from "@/lib/chatAlerts";
import { obtenerAlertasChatLive } from "./liveActions";

export default function AlertasChatLive({
  inicial,
  organizationId,
  currentUserId,
}: {
  inicial: AlertaChat[];
  organizationId: string;
  currentUserId: string;
}) {
  const [alertasChat, setAlertasChat] = useState(inicial);

  useEffect(() => {
    const supabase = createClient();

    async function refrescar() {
      const nuevas = await obtenerAlertasChatLive();
      setAlertasChat(nuevas);
    }

    const canal = supabase
      .channel(`alertas-chat-lista-${organizationId}-${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `organization_id=eq.${organizationId}` },
        () => { void refrescar(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_reads", filter: `user_id=eq.${currentUserId}` },
        () => { void refrescar(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, [organizationId, currentUserId]);

  if (alertasChat.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="font-display text-lg font-semibold mb-1">Mensajes sin leer</h2>
      <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
        Chat del canal general o directos que todavía no has abierto.
      </p>
      <div className="rounded-xl border overflow-hidden bg-white" style={{ borderColor: "var(--border)" }}>
        {alertasChat.map((a) => (
          <Link
            key={a.conversacion}
            href={`/dashboard/chat?con=${a.conversacion}`}
            className="flex items-center justify-between px-4 py-3 border-b last:border-0 hover:bg-[var(--bg)] transition"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: a.esGeneral ? "var(--chip-gold)" : "var(--state-lista)" }}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {a.esGeneral ? "Canal general" : `Mensaje directo de ${a.nombreOtro}`}
                </p>
                <p className="text-sm truncate" style={{ color: "var(--text-secondary)", maxWidth: "36rem" }}>
                  {a.ultimoMensaje}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 ml-4">
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {new Date(a.ultimaFecha).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
              <span
                className="text-xs font-semibold rounded-full px-2 py-0.5"
                style={{ background: "var(--chip-gold)", color: "var(--ink-950)" }}
              >
                {a.cantidad}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
