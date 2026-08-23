"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertaVencimiento } from "@/lib/alerts";
import { formatFecha, formatMoneda, estadoEfectivo } from "@/lib/ui";
import { marcarAlertasVistas } from "./liveActions";
import { renovarSim, desactivarSim } from "../sim/[id]/actions";

export default function AlertasVencimientoTable({ alertas }: { alertas: AlertaVencimiento[] }) {
  const [vistasLocal, setVistasLocal] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const pendientes = alertas.filter((a) => !a.vista && !vistasLocal.has(a.sim.id + a.fechaAniversario));

  function marcarUna(simId: string, fechaAniversario: string) {
    setVistasLocal((prev) => new Set(prev).add(simId + fechaAniversario));
    startTransition(() => {
      void marcarAlertasVistas([{ simId, fechaAniversario }]);
    });
  }

  function marcarTodas() {
    const items = pendientes.map((a) => ({ simId: a.sim.id, fechaAniversario: a.fechaAniversario }));
    if (items.length === 0) return;
    setVistasLocal((prev) => {
      const next = new Set(prev);
      items.forEach((i) => next.add(i.simId + i.fechaAniversario));
      return next;
    });
    startTransition(() => {
      void marcarAlertasVistas(items);
    });
  }

  const ordenadas = [...alertas].sort((a, b) => a.diasRestantes - b.diasRestantes);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Marcar como vista no cambia el estado de la SIM — solo quita el número de la campanita hasta que vuelva a cambiar la fecha de vencimiento.
        </p>
        <button
          onClick={marcarTodas}
          disabled={isPending || pendientes.length === 0}
          className="rounded-lg border px-3 py-1.5 text-sm font-medium bg-white disabled:opacity-50 shrink-0 ml-4"
          style={{ borderColor: "var(--border)" }}
        >
          Marcar todas como vistas{pendientes.length > 0 ? ` (${pendientes.length})` : ""}
        </button>
      </div>

      <div className="rounded-xl border overflow-hidden bg-white" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              <Th>ICC</Th>
              <Th>Proveedor</Th>
              <Th>Cliente</Th>
              <Th>Plan</Th>
              <Th>Precio</Th>
              <Th>Estado actual</Th>
              <Th>Activa desde</Th>
              <Th>Cumple plazo</Th>
              <Th>Vencimiento</Th>
              <Th>{""}</Th>
              <Th>{""}</Th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((a) => {
              const vista = a.vista || vistasLocal.has(a.sim.id + a.fechaAniversario);
              return (
                <tr
                  key={a.sim.id}
                  className="border-b last:border-0 hover:bg-[var(--bg)] transition"
                  style={{ borderColor: "var(--border)", opacity: vista ? 0.55 : 1 }}
                >
                  <td className="p-0">
                    <Link href={`/dashboard/sim/${a.sim.id}`} className="block px-4 py-3 icc-number">{a.sim.icc}</Link>
                  </td>
                  <td className="p-0"><Link href={`/dashboard/sim/${a.sim.id}`} className="block px-4 py-3">{a.sim.proveedor}</Link></td>
                  <td className="p-0"><Link href={`/dashboard/sim/${a.sim.id}`} className="block px-4 py-3">{a.sim.cliente_actual ?? "—"}</Link></td>
                  <td className="p-0">
                    <Link href={`/dashboard/sim/${a.sim.id}`} className="block px-4 py-3">
                      {a.sim.plan_cantidad ? `${a.sim.plan_cantidad} ${a.sim.plan_unidad}` : "—"}
                    </Link>
                  </td>
                  <td className="p-0"><Link href={`/dashboard/sim/${a.sim.id}`} className="block px-4 py-3">{formatMoneda(a.sim.precio_cliente)}</Link></td>
                  <td className="p-0"><Link href={`/dashboard/sim/${a.sim.id}`} className="block px-4 py-3">{estadoEfectivo(a.sim)}</Link></td>
                  <td className="p-0"><Link href={`/dashboard/sim/${a.sim.id}`} className="block px-4 py-3">{formatFecha(a.fechaActivacion)}</Link></td>
                  <td className="p-0"><Link href={`/dashboard/sim/${a.sim.id}`} className="block px-4 py-3">{formatFecha(a.fechaAniversario)}</Link></td>
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/sim/${a.sim.id}`}>
                      {a.diasRestantes < 0 ? (
                        <span className="status-pill" style={{ background: "#FDEAEA", color: "var(--state-desactivada)" }}>
                          Vencida hace {Math.abs(a.diasRestantes)} días
                        </span>
                      ) : (
                        <span className="status-pill" style={{ background: "#FDF3E4", color: "var(--state-lista)" }}>
                          Faltan {a.diasRestantes} días
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {vista ? (
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>Vista</span>
                    ) : (
                      <button
                        onClick={() => marcarUna(a.sim.id, a.fechaAniversario)}
                        disabled={isPending}
                        className="text-xs font-medium hover:underline cursor-pointer"
                        style={{ color: "var(--ink-900)" }}
                      >
                        Marcar como vista
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {a.diasRestantes < 0 && <AccionesVencida simId={a.sim.id} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">{children}</th>;
}

function AccionesVencida({ simId }: { simId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function renovar() {
    setError(null);
    startTransition(async () => {
      const res = await renovarSim(simId, fecha);
      if (res?.error) { setError(res.error); return; }
      setAbierto(false);
      router.refresh();
    });
  }

  function desactivar() {
    if (!confirm("¿Desactivar esta SIM? Va a quedar marcada como Desactivada en su hoja de vida.")) return;
    setError(null);
    startTransition(async () => {
      const res = await desactivarSim(simId, "Desactivada desde Alertas de vencimiento.");
      if (res?.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  if (abierto) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="input-filter"
          style={{ height: "2rem", padding: "0 0.5rem", fontSize: "0.75rem" }}
        />
        <button onClick={renovar} disabled={isPending} className="text-xs font-medium hover:underline cursor-pointer" style={{ color: "var(--state-activa)" }}>
          {isPending ? "Guardando…" : "Confirmar"}
        </button>
        <button onClick={() => setAbierto(false)} className="text-xs" style={{ color: "var(--text-muted)" }}>
          Cancelar
        </button>
        {error && <span className="text-xs" style={{ color: "var(--state-desactivada)" }}>{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={() => setAbierto(true)} className="text-xs font-medium hover:underline cursor-pointer" style={{ color: "var(--state-activa)" }}>
        Renovar
      </button>
      <button onClick={desactivar} disabled={isPending} className="text-xs font-medium hover:underline cursor-pointer" style={{ color: "var(--state-desactivada)" }}>
        Desactivar
      </button>
      {error && <span className="text-xs" style={{ color: "var(--state-desactivada)" }}>{error}</span>}
    </div>
  );
}
