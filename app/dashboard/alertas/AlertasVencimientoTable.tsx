"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertaVencimiento } from "@/lib/alerts";
import { formatFecha, formatMoneda, estadoEfectivo } from "@/lib/ui";
import { marcarAlertasVistas } from "./liveActions";
import { renovarSim, desactivarSim } from "../sim/[id]/actions";

export default function AlertasVencimientoTable({ alertas }: { alertas: AlertaVencimiento[] }) {
  const [vistasLocal, setVistasLocal] = useState<Set<string>>(new Set());
  const yaMarcado = useRef(false);

  // Con solo entrar a esta pantalla, todo lo que se está mostrando queda
  // marcado como visto — no hace falta ningún clic. Se dispara una sola vez
  // por carga de página (aunque la lista de alertas cambie después).
  useEffect(() => {
    if (yaMarcado.current) return;
    yaMarcado.current = true;

    const pendientesAlEntrar = alertas.filter((a) => !a.vista);
    if (pendientesAlEntrar.length === 0) return;

    setVistasLocal(new Set(pendientesAlEntrar.map((a) => a.sim.id + a.fechaAniversario)));
    void marcarAlertasVistas(pendientesAlEntrar.map((a) => ({ simId: a.sim.id, fechaAniversario: a.fechaAniversario })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ordenadas = [...alertas].sort((a, b) => a.diasRestantes - b.diasRestantes);

  return (
    <div>
      <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
        Al entrar aquí, estas alertas ya quedaron marcadas como vistas — no cambia el estado de la SIM, solo
        quita el número de la campanita hasta que vuelva a cambiar la fecha de vencimiento.
      </p>

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
