"use client";

import { useState, useTransition } from "react";
import { BulkOperation } from "@/lib/types";
import { formatFechaHora } from "@/lib/ui";
import { traducirError } from "@/lib/friendlyError";
import {
  previsualizarReasignaciones,
  aplicarReasignaciones,
  revertirReasignacion,
  ParReasignacion,
  AnalisisFila,
  FilaResultado,
} from "./actions";

/** Acepta "numeroCorto,icc" / "numeroCorto icc" / "numeroCorto;icc" — una
 *  pareja por línea. Devuelve también las líneas que no se pudieron leer. */
function parsearLista(texto: string): { pares: ParReasignacion[]; lineasInvalidas: string[] } {
  const pares: ParReasignacion[] = [];
  const lineasInvalidas: string[] = [];

  for (const lineaCruda of texto.split("\n")) {
    const linea = lineaCruda.trim();
    if (!linea) continue;
    const partes = linea.split(/[\s,;]+/).filter(Boolean);
    if (partes.length !== 2) {
      lineasInvalidas.push(lineaCruda);
      continue;
    }
    pares.push({ numeroCorto: partes[0], iccDestino: partes[1] });
  }

  return { pares, lineasInvalidas };
}

export default function ReasignacionNumerosManager({
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
      <FormularioReasignacion currentUserId={currentUserId} onAplicado={(op) => setLista((prev) => [op, ...prev])} />

      <section className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-display text-base font-semibold">Historial de reasignaciones</h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Cada fila es una tanda (una o varias reasignaciones). Se puede deshacer si algo quedó mal.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Fecha</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Nota</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Cantidad</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Hecho por</th>
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
            Todavía no se ha hecho ninguna reasignación.
          </div>
        )}
      </section>
      <style jsx global>{`.input { width: 100%; border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.55rem 0.75rem; font-size: 0.875rem; }`}</style>
    </div>
  );
}

type Etapa = "captura" | "revision" | "hecho";

function FormularioReasignacion({ currentUserId, onAplicado }: { currentUserId: string; onAplicado: (op: BulkOperation) => void }) {
  const [etapa, setEtapa] = useState<Etapa>("captura");
  const [texto, setTexto] = useState("");
  const [lineasInvalidas, setLineasInvalidas] = useState<string[]>([]);
  const [filas, setFilas] = useState<AnalisisFila[]>([]);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ aplicadas: number; resultados: FilaResultado[] } | null>(null);
  const [isPending, startTransition] = useTransition();

  function revisar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { pares, lineasInvalidas: invalidas } = parsearLista(texto);
    setLineasInvalidas(invalidas);
    if (pares.length === 0) {
      setError("Escribe al menos una línea con \"número corto, ICC\".");
      return;
    }
    startTransition(async () => {
      const res = await previsualizarReasignaciones(pares);
      if (res.error) {
        setError(traducirError(res.error));
        return;
      }
      setFilas((res.filas ?? []).map((f) => ({ ...f })));
      setEtapa("revision");
    });
  }

  function alternarIncluir(fila: number) {
    setFilas((prev) => prev.map((f) => (f.fila === fila ? { ...f, incluir: !f.incluir } : f)));
  }

  function confirmar() {
    setError(null);
    const paresIncluidos = filas.filter((f) => f.incluir && !f.error && !f.sinCambios).map((f) => ({ numeroCorto: f.numeroCorto, iccDestino: f.iccDestino }));
    if (paresIncluidos.length === 0) {
      setError("No queda ninguna fila lista para aplicar.");
      return;
    }
    startTransition(async () => {
      const res = await aplicarReasignaciones(paresIncluidos, nota);
      if (res.error) {
        setError(traducirError(res.error));
        return;
      }
      setResultado({ aplicadas: res.aplicadas ?? 0, resultados: res.resultados ?? [] });
      setEtapa("hecho");
      onAplicado({
        id: res.operacionId!,
        organization_id: "",
        tipo: "reasignacion_numero",
        estado_nuevo: null,
        cantidad_sims: res.aplicadas ?? 0,
        nota: nota.trim() || null,
        created_by: currentUserId,
        created_at: new Date().toISOString(),
        revertida_at: null,
        revertida_by: null,
      } as BulkOperation);
    });
  }

  function empezarDeNuevo() {
    setEtapa("captura");
    setTexto("");
    setFilas([]);
    setNota("");
    setError(null);
    setResultado(null);
  }

  const filasAplicables = filas.filter((f) => f.incluir && !f.error && !f.sinCambios);
  const filasConError = filas.filter((f) => f.error);
  const filasSinCambios = filas.filter((f) => f.sinCambios);

  return (
    <section className="rounded-xl border bg-white p-6" style={{ borderColor: "var(--border)" }}>
      {etapa === "captura" && (
        <form onSubmit={revisar} className="flex flex-col gap-3 max-w-2xl">
          <label className="text-sm font-medium">
            Uno o varios: <span className="font-mono">número corto, ICC destino</span> — un par por línea
          </label>
          <textarea
            className="input font-mono"
            rows={8}
            placeholder={"9103340944, 8991000012345678901\n9103340945, 8991000012345678902"}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Puedes separar con coma, espacio o punto y coma. Para uno solo, basta con una línea.
          </p>
          {lineasInvalidas.length > 0 && (
            <p className="text-xs" style={{ color: "var(--state-desactivada)" }}>
              {lineasInvalidas.length} línea(s) no se entendieron (deben tener exactamente número corto + ICC): {lineasInvalidas.join(" | ")}
            </p>
          )}
          <button
            type="submit"
            disabled={isPending || !texto.trim()}
            className="rounded-lg py-2 px-4 text-sm font-semibold text-white self-start disabled:opacity-60 hover:underline cursor-pointer"
            style={{ background: "var(--ink-900)" }}
          >
            {isPending ? "Revisando…" : "Revisar"}
          </button>
          {error && <p className="text-sm" style={{ color: "var(--state-desactivada)" }}>{error}</p>}
        </form>
      )}

      {etapa === "revision" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            {filasAplicables.length} lista(s) para aplicar, {filasSinCambios.length} sin cambios, {filasConError.length} con error.
          </p>

          <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
            {filas.map((f) => (
              <div
                key={f.fila}
                className="rounded-lg border p-3 text-sm flex items-start gap-3"
                style={{
                  borderColor: f.error ? "var(--state-desactivada)" : "var(--border)",
                  background: f.error ? "#FDEAEA" : f.sinCambios ? "#F5F5F5" : "#F0F7F1",
                }}
              >
                {!f.error && !f.sinCambios && (
                  <input type="checkbox" checked={f.incluir} onChange={() => alternarIncluir(f.fila)} className="mt-1" />
                )}
                <div>
                  <p className="font-mono font-medium mb-0.5">
                    {f.numeroCorto} → {f.iccDestino}
                  </p>
                  <p style={{ color: f.error ? "var(--state-desactivada)" : "var(--text-secondary)" }}>
                    {f.error ?? f.resumen}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <input className="input max-w-md" placeholder="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />

          <div className="flex gap-3">
            <button
              onClick={confirmar}
              disabled={isPending || filasAplicables.length === 0}
              className="rounded-lg py-2 px-4 text-sm font-semibold text-white disabled:opacity-60 hover:underline cursor-pointer"
              style={{ background: "var(--ink-900)" }}
            >
              {isPending ? "Aplicando…" : `Confirmar y aplicar ${filasAplicables.length}`}
            </button>
            <button onClick={empezarDeNuevo} disabled={isPending} className="rounded-lg py-2 px-4 text-sm font-medium cursor-pointer" style={{ border: "1px solid var(--border)" }}>
              Editar lista
            </button>
          </div>
          {error && <p className="text-sm" style={{ color: "var(--state-desactivada)" }}>{error}</p>}
        </div>
      )}

      {etapa === "hecho" && resultado && (
        <div className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: "var(--state-activa)" }}>
            Se reasignaron {resultado.aplicadas} número(s) corto.
          </p>
          {resultado.resultados.some((r) => !r.ok) && (
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              <p className="font-medium mb-1">Filas con error:</p>
              <ul className="list-disc pl-4">
                {resultado.resultados.filter((r) => !r.ok).map((r) => (
                  <li key={r.fila}>{r.numeroCorto} → {r.iccDestino}: {r.error}</li>
                ))}
              </ul>
            </div>
          )}
          <button onClick={empezarDeNuevo} className="rounded-lg py-2 px-4 text-sm font-semibold text-white self-start cursor-pointer" style={{ background: "var(--ink-900)" }}>
            Hacer otra reasignación
          </button>
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
    if (!confirm(`¿Deshacer esta tanda (${operacion.cantidad_sims} número(s))? Cada ICC y número corto vuelve a como estaba antes.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await revertirReasignacion(operacion.id);
      if (res?.error) { setError(traducirError(res.error)); return; }
      onActualizada({ ...operacion, revertida_at: new Date().toISOString(), revertida_by: currentUserId });
    });
  }

  return (
    <tr className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <td className="px-4 py-3 whitespace-nowrap">{formatFechaHora(operacion.created_at)}</td>
      <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{operacion.nota ?? "—"}</td>
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
