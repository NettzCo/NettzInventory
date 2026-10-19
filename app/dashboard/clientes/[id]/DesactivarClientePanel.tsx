"use client";

import { useState, useTransition } from "react";
import { desactivarCliente, reactivarCliente, DesactivacionVigente } from "./actions";
import { formatFechaHora } from "@/lib/ui";
import { traducirError } from "@/lib/friendlyError";

export default function DesactivarClientePanel({
  clienteNombre,
  proveedoresDisponibles,
  desactivacionVigente,
  puedeEditar,
}: {
  clienteNombre: string;
  proveedoresDisponibles: string[];
  desactivacionVigente: DesactivacionVigente | null;
  puedeEditar: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<"total" | "cartera">("cartera");
  const [alcance, setAlcance] = useState<"todos" | "elegir">("todos");
  const [proveedoresElegidos, setProveedoresElegidos] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  if (!puedeEditar) return null;

  function toggleProveedor(p: string) {
    setProveedoresElegidos((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  function confirmarDesactivacion() {
    if (alcance === "elegir" && proveedoresElegidos.length === 0) {
      setFeedback({ tipo: "error", texto: "Elige al menos un proveedor, o cambia a \"Todos los proveedores\"." });
      return;
    }
    const proveedores = alcance === "todos" ? [] : proveedoresElegidos;
    const alcanceTexto = alcance === "todos" ? "TODAS sus SIM, de todos los proveedores" : `sus SIM de: ${proveedores.join(", ")}`;
    const motivoTexto = tipo === "cartera" ? "temporalmente por cartera (pago/facturación)" : "totalmente (cancelación)";
    if (!confirm(`¿Desactivar a ${clienteNombre} ${motivoTexto}? Esto va a desactivar ${alcanceTexto}.`)) return;

    setFeedback(null);
    startTransition(async () => {
      const res = await desactivarCliente(clienteNombre, tipo, proveedores);
      if ("error" in res) {
        setFeedback({ tipo: "error", texto: traducirError(res.error) });
      } else {
        setFeedback({
          tipo: res.avisoCliente ? "error" : "ok",
          texto: res.avisoCliente ?? `Se desactivaron ${res.cantidad} SIM.`,
        });
        setAbierto(false);
      }
    });
  }

  function confirmarReactivacion() {
    if (!desactivacionVigente) return;
    if (!confirm(`¿Reactivar a ${clienteNombre}? Cada SIM va a volver exactamente al estado que tenía antes de la desactivación.`)) return;

    setFeedback(null);
    startTransition(async () => {
      const res = await reactivarCliente(desactivacionVigente.id);
      if ("error" in res) {
        setFeedback({ tipo: "error", texto: traducirError(res.error) });
      } else {
        setFeedback({
          tipo: res.avisoCliente ? "error" : "ok",
          texto: res.avisoCliente ?? `Se reactivaron ${res.reactivadas} SIM a su estado anterior.`,
        });
      }
    });
  }

  return (
    <section className="rounded-xl border bg-white p-6 mb-6" style={{ borderColor: "var(--border)" }}>
      <h2 className="font-display text-base font-semibold mb-4">Desactivación del cliente</h2>

      {feedback && (
        <div
          className="text-sm rounded-lg px-4 py-3 mb-4"
          style={{
            background: feedback.tipo === "ok" ? "#E7F5EC" : "#FDECEC",
            color: feedback.tipo === "ok" ? "var(--state-activa)" : "var(--state-vencida)",
          }}
        >
          {feedback.texto}
        </div>
      )}

      {desactivacionVigente ? (
        <div>
          <p className="text-sm mb-1">
            {desactivacionVigente.tipo_desactivacion === "cartera" ? (
              <>Este cliente sigue <strong>Activo</strong>, pero tiene sus SIM <strong>cortadas por cartera</strong></>
            ) : (
              <>Este cliente está <strong>desactivado totalmente</strong></>
            )}
            {desactivacionVigente.proveedores_incluidos && desactivacionVigente.proveedores_incluidos.length > 0
              ? ` (proveedores: ${desactivacionVigente.proveedores_incluidos.join(", ")})`
              : " (todos los proveedores)"}
            .
          </p>
          <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
            {desactivacionVigente.cantidad_sims} SIM afectadas · desde {formatFechaHora(desactivacionVigente.created_at)}
          </p>
          <button
            onClick={confirmarReactivacion}
            disabled={isPending}
            className="rounded-lg py-2 px-4 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--state-activa)" }}
          >
            {isPending ? "Reactivando…" : "Reactivar cliente"}
          </button>
          <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
            Cada SIM vuelve exactamente al estado que tenía antes — no todas quedan "Activa" a la fuerza.
          </p>
        </div>
      ) : !abierto ? (
        <button
          onClick={() => setAbierto(true)}
          className="rounded-lg border-2 px-4 py-2 text-sm font-semibold bg-white"
          style={{ borderColor: "var(--state-desactivada)", color: "var(--state-desactivada)" }}
        >
          Desactivar cliente
        </button>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">Tipo de desactivación</p>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={tipo === "cartera"} onChange={() => setTipo("cartera")} />
                Temporal por cartera (pago/facturación pendiente)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={tipo === "total"} onChange={() => setTipo("total")} />
                Total (cliente solicitó cancelar el servicio)
              </label>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Alcance</p>
            <div className="flex gap-4 mb-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={alcance === "todos"} onChange={() => setAlcance("todos")} />
                Todos los proveedores
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={alcance === "elegir"} onChange={() => setAlcance("elegir")} />
                Elegir proveedores
              </label>
            </div>
            {alcance === "elegir" && (
              <div className="flex flex-wrap gap-3 pl-1">
                {proveedoresDisponibles.map((p) => (
                  <label key={p} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={proveedoresElegidos.includes(p)} onChange={() => toggleProveedor(p)} />
                    {p}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={confirmarDesactivacion}
              disabled={isPending}
              className="rounded-lg py-2 px-4 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--state-desactivada)" }}
            >
              {isPending ? "Desactivando…" : "Confirmar desactivación"}
            </button>
            <button
              onClick={() => setAbierto(false)}
              disabled={isPending}
              className="rounded-lg border px-4 py-2 text-sm font-medium bg-white"
              style={{ borderColor: "var(--border)" }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
