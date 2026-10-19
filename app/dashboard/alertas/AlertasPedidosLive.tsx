"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AlertaPedido } from "@/lib/pedidoAlerts";
import { obtenerAlertasPedidosLive } from "./liveActions";

export default function AlertasPedidosLive({
  inicial,
  organizationId,
  currentUserId,
}: {
  inicial: AlertaPedido[];
  organizationId: string;
  currentUserId: string;
}) {
  const [alertasPedidos, setAlertasPedidos] = useState(inicial);

  useEffect(() => {
    const supabase = createClient();

    async function refrescar() {
      const nuevas = await obtenerAlertasPedidosLive();
      setAlertasPedidos(nuevas);
    }

    const canal = supabase
      .channel(`alertas-pedidos-${organizationId}-${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos", filter: `organization_id=eq.${organizationId}` },
        () => { void refrescar(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, [organizationId, currentUserId]);

  if (alertasPedidos.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="font-display text-lg font-semibold mb-1">Pedidos por despachar</h2>
      <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
        Pedidos de SIM cards asignados a ti que todavía no has marcado como enviados.
      </p>
      <div className="rounded-xl border overflow-hidden bg-white" style={{ borderColor: "var(--border)" }}>
        {alertasPedidos.map((a) => (
          <Link
            key={a.id}
            href="/dashboard/pedidos"
            className="flex items-center justify-between px-4 py-3 border-b last:border-0 hover:bg-[var(--bg)] transition"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "var(--state-lista)" }} />
              <p className="text-sm font-medium">
                {a.cantidad} SIM{a.cantidad === 1 ? "" : "s"} para {a.clienteNombre}
              </p>
            </div>
            <span className="text-xs flex-shrink-0" style={{ color: "var(--text-muted)" }}>
              {new Date(a.createdAt).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
