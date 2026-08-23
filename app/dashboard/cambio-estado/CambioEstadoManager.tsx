"use client";

import { useState, useTransition } from "react";
import { BulkOperation, ESTADOS_SIM } from "@/lib/types";
import { formatFechaHora } from "@/lib/ui";
import { aplicarCambios, revertirOperacionMasiva, ResultadoCambioMasivo, AsignacionRapida } from "./actions";

interface Opcion {
  id: string;
  nombre?: string;
  full_name?: string;
}

const ASIGNACION_VACIA: AsignacionRapida = {
  cliente_nombre: "",
  plan_unidad: "Gigas",
  plan_cantidad: "",
  tipo_plan: "Prepago",
  pago_momento: "Anticipado",
  duracion_meses: "12",
  precio_cliente: "",
  comercial_id: "",
  broker_id: "",
  fecha_entrega: new Date().toISOString().slice(0, 10),
};

export default function CambioEstadoManager({
  operaciones,
  nombrePorId,
  currentUserId,
  esSuperAdmin,
  clientes,
  comerciales,
}: {
  operaciones: BulkOperation[];
  nombrePorId: Record<string, string>;
  currentUserId: string;
  esSuperAdmin: boolean;
  clientes: Opcion[];
  comerciales: Opcion[];
}) {
  const [lista, setLista] = useState(operaciones);

  function actualizar(op: BulkOperation) {
    setLista((prev) => prev.map((o) => (o.id === op.id ? op : o)));
  }

  return (
    <div className="flex flex-col gap-8">
      <FormularioCambio onAplicado={(op) => setLista((prev) => [op, ...prev])} clientes={clientes} comerciales={comerciales} />

      <section className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-display text-base font-semibold">Historial de cambios</h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Cada fila es una operación (individual o masiva). Se puede deshacer si se cargó algo mal.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Fecha</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Qué cambió</th>
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
            Todavía no se ha registrado ningún cambio.
          </div>
        )}
      </section>
      <style jsx global>{`.input { width: 100%; border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.55rem 0.75rem; font-size: 0.875rem; }`}</style>
    </div>
  );
}

function FormularioCambio({
  onAplicado,
  clientes,
  comerciales,
}: {
  onAplicado: (op: BulkOperation) => void;
  clientes: Opcion[];
  comerciales: Opcion[];
}) {
  const [modo, setModo] = useState<"individual" | "masivo">("individual");
  const [icc, setIcc] = useState("");
  const [iccsTexto, setIccsTexto] = useState("");
  const [nota, setNota] = useState("");

  const [cambiarEstado, setCambiarEstado] = useState(true);
  const [nuevoEstado, setNuevoEstado] = useState<string>("Activa");

  const [cambiarAsignacion, setCambiarAsignacion] = useState(false);
  const [asignacion, setAsignacion] = useState<AsignacionRapida>(ASIGNACION_VACIA);

  const [resultado, setResultado] = useState<ResultadoCambioMasivo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function patch(p: Partial<AsignacionRapida>) {
    setAsignacion((prev) => ({ ...prev, ...p }));
  }

  function aplicar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResultado(null);
    const entrada = modo === "individual" ? icc : iccsTexto;

    startTransition(async () => {
      const res = await aplicarCambios(
        entrada,
        {
          cambiarEstado,
          nuevoEstado: cambiarEstado ? nuevoEstado : undefined,
          cambiarAsignacion,
          asignacion: cambiarAsignacion ? asignacion : undefined,
        },
        nota
      );
      if (res.error) {
        setError(res.error);
        setResultado(res.omitidas ? res : null);
        return;
      }
      setResultado(res);
      setIcc("");
      setIccsTexto("");
      setNota("");
      setCambiarAsignacion(false);
      setAsignacion(ASIGNACION_VACIA);
      onAplicado({
        id: crypto.randomUUID(),
        organization_id: "",
        tipo: "cambio_estado",
        estado_nuevo: (cambiarEstado ? nuevoEstado : null) as never,
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

      <form onSubmit={aplicar} className="flex flex-col gap-4 max-w-xl">
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

        {/* Sección 1: estado */}
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
          <label className="flex items-center gap-2 text-sm font-medium mb-3">
            <input type="checkbox" checked={cambiarEstado} onChange={(e) => setCambiarEstado(e.target.checked)} />
            Cambiar el estado
          </label>
          {cambiarEstado && (
            <select className="input" value={nuevoEstado} onChange={(e) => setNuevoEstado(e.target.value)}>
              {ESTADOS_SIM.map((e) => (
                <option key={e} value={e}>Nuevo estado: {e}</option>
              ))}
            </select>
          )}
        </div>

        {/* Sección 2: cliente, plan y precio */}
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
          <label className="flex items-center gap-2 text-sm font-medium mb-3">
            <input type="checkbox" checked={cambiarAsignacion} onChange={(e) => setCambiarAsignacion(e.target.checked)} />
            Cambiar el cliente responsable, el plan o el precio
          </label>

          {cambiarAsignacion && (
            <div className="flex flex-col gap-3">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Si la SIM ya tenía un cliente, esa asignación se cierra y queda en su hoja de vida —
                no se pierde el dato, solo pasa a ser historial.
              </p>
              <input
                className="input"
                list="clientes-cambios"
                placeholder="Nombre del cliente *"
                value={asignacion.cliente_nombre}
                onChange={(e) => patch({ cliente_nombre: e.target.value })}
                required={cambiarAsignacion}
              />
              <datalist id="clientes-cambios">
                {clientes.map((c) => <option key={c.id} value={c.nombre} />)}
              </datalist>

              <div className="grid grid-cols-2 gap-3">
                <select className="input" value={asignacion.tipo_plan} onChange={(e) => patch({ tipo_plan: e.target.value })}>
                  <option value="Prepago">Tipo de plan: Prepago</option>
                  <option value="Postpago">Tipo de plan: Postpago</option>
                </select>
                {asignacion.tipo_plan === "Prepago" && (
                  <select className="input" value={asignacion.duracion_meses} onChange={(e) => patch({ duracion_meses: e.target.value })}>
                    <option value="6">Duración: 6 meses</option>
                    <option value="12">Duración: 12 meses</option>
                  </select>
                )}

                <select className="input" value={asignacion.pago_momento} onChange={(e) => patch({ pago_momento: e.target.value })}>
                  <option value="Anticipado">Anticipado</option>
                  <option value="Mes vencido">Mes vencido (factura)</option>
                </select>

                <input className="input" type="number" placeholder="Cantidad de datos *" value={asignacion.plan_cantidad} onChange={(e) => patch({ plan_cantidad: e.target.value })} required={cambiarAsignacion} />
                <select className="input" value={asignacion.plan_unidad} onChange={(e) => patch({ plan_unidad: e.target.value })}>
                  <option value="Megas">Megas</option>
                  <option value="Gigas">Gigas</option>
                </select>

                <input className="input" type="number" placeholder="Precio a cliente (COP) *" value={asignacion.precio_cliente} onChange={(e) => patch({ precio_cliente: e.target.value })} required={cambiarAsignacion} />
                <input className="input" type="date" value={asignacion.fecha_entrega} onChange={(e) => patch({ fecha_entrega: e.target.value })} required={cambiarAsignacion} />

                <select className="input" value={asignacion.comercial_id} onChange={(e) => patch({ comercial_id: e.target.value })} required={cambiarAsignacion}>
                  <option value="">Comercial que entrega *</option>
                  {comerciales.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
                <select className="input" value={asignacion.broker_id} onChange={(e) => patch({ broker_id: e.target.value })}>
                  <option value="">Broker asociado (opcional)</option>
                  {comerciales.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        <input className="input" placeholder="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />

        <button
          type="submit"
          disabled={isPending || (!cambiarEstado && !cambiarAsignacion)}
          className="rounded-lg py-2 px-4 text-sm font-semibold text-white self-start disabled:opacity-60 hover:underline cursor-pointer"
          style={{ background: "var(--ink-900)" }}
        >
          {isPending ? "Aplicando…" : "Aplicar cambio"}
        </button>
      </form>

      {error && <p className="text-sm mt-3" style={{ color: "var(--state-desactivada)" }}>{error}</p>}
      {resultado?.ok && (
        <p className="text-sm mt-3" style={{ color: "var(--state-activa)" }}>
          Se actualizaron {resultado.aplicadas} SIM.
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
    if (!confirm(`¿Deshacer este cambio (${operacion.cantidad_sims} SIM)? Cada una vuelve a como estaba antes.`)) return;
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
