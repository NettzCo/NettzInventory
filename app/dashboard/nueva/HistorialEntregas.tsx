"use client";

import { useState, useTransition } from "react";
import { BulkOperation } from "@/lib/types";
import { formatFechaHora } from "@/lib/ui";
import { revertirOperacionMasiva } from "../cambio-estado/actions";

export default function HistorialEntregas({
  operaciones,
  nombrePorId,
  currentUserId,
  esSuperAdmin,
}: {
  operaciones: BulkOperation[];
  nombrePorId: Record<string, string>;
  currentUserId: string;
  esSuperAdmin: boolean;
}) {
  const [lista, setLista] = useState(operaciones);

  return (
    <section className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "var(--border)" }}>
      <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-display text-base font-semibold">Historial de entregas registradas</h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Cada fila es una entrega (individual o por carga masiva). Si algo se cargó mal, se puede deshacer —
          las SIM afectadas vuelven a quedar sin cliente asignado.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
            <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Fecha</th>
            <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Detalle</th>
            <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">SIM afectadas</th>
            <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Registrada por</th>
            <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Estado</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {lista.map((op) => (
            <FilaEntrega
              key={op.id}
              operacion={op}
              nombrePorId={nombrePorId}
              currentUserId={currentUserId}
              esSuperAdmin={esSuperAdmin}
              onActualizada={(actualizada) => setLista((prev) => prev.map((o) => (o.id === actualizada.id ? actualizada : o)))}
            />
          ))}
        </tbody>
      </table>
      {lista.length === 0 && (
        <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          Todavía no se ha registrado ninguna entrega.
        </div>
      )}
    </section>
  );
}

function FilaEntrega({
  operacion,
  nombrePorId,
  currentUserId,
  esSuperAdmin,
  onActualizada,
}: {
  operacion: BulkOperation;
  nombrePorId: Record<string, string>;
  currentUserId: string;
  esSuperAdmin: boolean;
  onActualizada: (op: BulkOperation) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const puedeDeshacer = (operacion.created_by === currentUserId || esSuperAdmin) && !operacion.revertida_at;

  function deshacer() {
    if (!confirm(`¿Deshacer esta entrega (${operacion.cantidad_sims} SIM)? Cada una vuelve a quedar sin cliente asignado.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await revertirOperacionMasiva(operacion.id);
      if (res?.error) { setError(res.error); return; }
      onActualizada({ ...operacion, revertida_at: new Date().toISOString(), revertida_by: currentUserId });
    });
  }

  return (
    <tr className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <td className="px-4 py-3 whitespace-nowrap">{formatFechaHora(operacion.created_at)}</td>
      <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{operacion.nota ?? "Entrega registrada"}</td>
      <td className="px-4 py-3">{operacion.cantidad_sims}</td>
      <td className="px-4 py-3">{nombrePorId[operacion.created_by] ?? "—"}</td>
      <td className="px-4 py-3">
        {operacion.revertida_at ? (
          <span className="status-pill" style={{ background: "#FDEAEA", color: "var(--state-desactivada)" }}>Deshecha</span>
        ) : (
          <span className="status-pill" style={{ background: "#E7F5EC", color: "var(--state-activa)" }}>Vigente</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {puedeDeshacer && (
          <button onClick={deshacer} disabled={isPending} className="text-sm font-medium hover:underline cursor-pointer" style={{ color: "var(--state-desactivada)" }}>
            {isPending ? "Deshaciendo…" : "Deshacer"}
          </button>
        )}
        {error && <p className="text-xs mt-1" style={{ color: "var(--state-desactivada)" }}>{error}</p>}
      </td>
    </tr>
  );
}
