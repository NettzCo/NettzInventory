"use client";

import { useState, useTransition } from "react";
import { BulkOperation, ESTADOS_SIM } from "@/lib/types";
import { formatFechaHora } from "@/lib/ui";
import { cambiarEstadoMasivo, revertirOperacionMasiva, ResultadoCambioMasivo } from "./actions";

export default function CambioEstadoManager({
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

  function actualizar(op: BulkOperation) {
    setLista((prev) => prev.map((o) => (o.id === op.id ? op : o)));
  }

  return (
    <div className="flex flex-col gap-8">
      <FormularioCambio onAplicado={(op) => setLista((prev) => [op, ...prev])} />

      <section className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-display text-base font-semibold">Historial de cambios de estado</h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Cada fila es una operación (individual o masiva). Se puede deshacer si se cargó algo mal.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Fecha</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Cambió a</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Cantidad</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Hecho por</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Nota</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((op) => (
              <FilaOperacion key={op.id} operacion={op} nombrePorId={nombrePorId} currentUserId={currentUserId} esSuperAdmin={esSuperAdmin} onActualizada={actualizar} />
            ))}
          </tbody>
        </table>
        {lista.length === 0 && (
          <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Todavía no se ha registrado ningún cambio de estado.
          </div>
        )}
      </section>
      <style jsx global>{`.input { width: 100%; border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.55rem 0.75rem; font-size: 0.875rem; }`}</style>
    </div>
  );
}

function FormularioCambio({ onAplicado }: { onAplicado: (op: BulkOperation) => void }) {
  const [modo, setModo] = useState<"individual" | "masivo">("individual");
  const [icc, setIcc] = useState("");
  const [iccsTexto, setIccsTexto] = useState("");
  const [nuevoEstado, setNuevoEstado] = useState<string>("Activa");
  const [nota, setNota] = useState("");
  const [resultado, setResultado] = useState<ResultadoCambioMasivo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function aplicar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResultado(null);
    const entrada = modo === "individual" ? icc : iccsTexto;

    startTransition(async () => {
      const res = await cambiarEstadoMasivo(entrada, nuevoEstado, nota);
      if (res.error) {
        setError(res.error);
        setResultado(res.omitidas ? res : null);
        return;
      }
      setResultado(res);
      setIcc("");
      setIccsTexto("");
      setNota("");
      onAplicado({
        id: crypto.randomUUID(),
        organization_id: "",
        tipo: "cambio_estado",
        estado_nuevo: nuevoEstado as never,
        cantidad_sims: res.aplicadas ?? 0,
        nota: nota.trim() || null,
        created_by: "",
        created_at: new Date().toISOString(),
        revertida_at: null,
        revertida_by: null,
      });
    });
  }

  return (
    <section className="rounded-xl border bg-white p-6" style={{ borderColor: "var(--border)" }}>
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setModo("individual")}
          className="rounded-lg px-3 py-1.5 text-sm font-medium"
          style={{ background: modo === "individual" ? "var(--ink-900)" : "white", color: modo === "individual" ? "white" : "var(--text-primary)", border: "1px solid var(--border)" }}
        >
          Una SIM
        </button>
        <button
          type="button"
          onClick={() => setModo("masivo")}
          className="rounded-lg px-3 py-1.5 text-sm font-medium"
          style={{ background: modo === "masivo" ? "var(--ink-900)" : "white", color: modo === "masivo" ? "white" : "var(--text-primary)", border: "1px solid var(--border)" }}
        >
          Varias a la vez
        </button>
      </div>

      <form onSubmit={aplicar} className="flex flex-col gap-3 max-w-xl">
        {modo === "individual" ? (
          <input className="input" placeholder="ICC de la SIM" value={icc} onChange={(e) => setIcc(e.target.value)} required />
        ) : (
          <textarea
            className="input"
            rows={6}
            placeholder={"Pega los ICC, uno por línea (o separados por coma)\nEj:\n8957000000000001\n8957000000000002"}
            value={iccsTexto}
            onChange={(e) => setIccsTexto(e.target.value)}
            required
          />
        )}

        <select className="input" value={nuevoEstado} onChange={(e) => setNuevoEstado(e.target.value)} required>
          {ESTADOS_SIM.map((e) => (
            <option key={e} value={e}>Cambiar a: {e}</option>
          ))}
        </select>

        <input className="input" placeholder="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />

        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg py-2 px-4 text-sm font-semibold text-white self-start disabled:opacity-60 hover:underline cursor-pointer"
          style={{ background: "var(--ink-900)" }}
        >
          {isPending ? "Aplicando…" : "Aplicar cambio"}
        </button>
      </form>

      {error && <p className="text-sm mt-3" style={{ color: "var(--state-desactivada)" }}>{error}</p>}
      {resultado?.ok && (
        <p className="text-sm mt-3" style={{ color: "var(--state-activa)" }}>
          Se actualizaron {resultado.aplicadas} SIM a &quot;{nuevoEstado}&quot;.
        </p>
      )}
      {resultado?.omitidas && resultado.omitidas.length > 0 && (
        <div className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
          <p className="font-medium mb-1">{resultado.omitidas.length} ICC no se aplicaron:</p>
          <ul className="list-disc pl-4 max-h-32 overflow-y-auto">
            {resultado.omitidas.map((o, i) => (
              <li key={i}>{o.icc} — {o.motivo}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function FilaOperacion({
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
    if (!confirm(`¿Deshacer este cambio de estado (${operacion.cantidad_sims} SIM)? Cada una vuelve al estado que tenía antes.`)) return;
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
      <td className="px-4 py-3">
        <span className="status-pill" style={{ background: "#FDF3E4", color: "var(--state-lista)" }}>{operacion.estado_nuevo}</span>
      </td>
      <td className="px-4 py-3">{operacion.cantidad_sims}</td>
      <td className="px-4 py-3">{nombrePorId[operacion.created_by] ?? "—"}</td>
      <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>{operacion.nota ?? "—"}</td>
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
