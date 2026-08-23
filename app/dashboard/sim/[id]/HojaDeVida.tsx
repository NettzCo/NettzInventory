"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { addMonths } from "date-fns";
import { SimCard, SimCurrentView, HojaDeVidaEvento, Profile, ESTADOS_SIM, EstadoSim } from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import { formatFecha, formatFechaHora, formatMoneda } from "@/lib/ui";
import { cambiarEstado, asignarNumeroCorto, reasignarCliente, actualizarDetalles, ReasignacionInput } from "./actions";
import ClienteAutocomplete, { ClienteOpcion } from "@/components/ClienteAutocomplete";

type Panel = null | "estado" | "numero" | "cliente" | "detalles";

const EVENT_ICON: Record<HojaDeVidaEvento["tipo"], string> = {
  creacion: "◆",
  estado: "●",
  numero_corto: "#",
  asignacion: "→",
};

export default function HojaDeVida({
  simCard,
  current,
  eventos,
  comerciales,
  brokers,
  apns,
  clientes,
  puedeEditar,
}: {
  simCard: SimCard;
  current: SimCurrentView | null;
  eventos: HojaDeVidaEvento[];
  comerciales: Profile[];
  brokers: Profile[];
  apns: { id: string; name: string }[];
  clientes: ClienteOpcion[];
  puedeEditar: boolean;
}) {
  const [panel, setPanel] = useState<Panel>(null);

  // Solo tiene sentido mostrar un vencimiento si está Activa y es Prepago —
  // se cuenta desde que empezó ese estado (estado_desde = fecha de
  // activación) más la duración del plan.
  const fechaVencimiento =
    current?.estado_actual === "Activa" && current?.tipo_plan === "Prepago" && current?.estado_desde
      ? addMonths(new Date(current.estado_desde), current.duracion_meses ?? 12)
      : null;

  return (
    <main className="p-8 max-w-5xl">
      <Link href="/dashboard/inventario" className="text-sm mb-4 inline-block" style={{ color: "var(--text-secondary)" }}>
        ← Volver al inventario
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>
            {simCard.proveedor}
          </p>
          <h1 className="font-display text-2xl font-semibold icc-number">{simCard.icc}</h1>
        </div>
        <StatusPill estado={current?.estado_actual ?? null} />
      </div>

      {/* Resumen actual */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Resumen label="Número corto" valor={current?.numero_corto_actual ?? "—"} mono />
        <Resumen label="Cliente actual" valor={current?.cliente_actual ?? "—"} />
        <Resumen label="Plan" valor={current?.plan_cantidad ? `${current.plan_cantidad} ${current.plan_unidad}` : "—"} />
        <Resumen label="Tipo / pago" valor={current?.tipo_plan ? `${current.tipo_plan} · ${current.pago_momento}` : "—"} />
        <Resumen label="Precio a cliente" valor={formatMoneda(current?.precio_cliente)} />
        <Resumen label="Comercial" valor={current?.comercial_nombre ?? "—"} />
        <Resumen label="Broker" valor={current?.broker_nombre ?? "Sin broker"} />
        <Resumen label="Entregada el" valor={formatFecha(current?.fecha_entrega)} />
        {current?.tipo_plan === "Prepago" && (
          <Resumen
            label="Vence el"
            valor={fechaVencimiento ? formatFecha(fechaVencimiento.toISOString()) : "— (aún no está Activa)"}
          />
        )}
        <Resumen label="APN" valor={simCard.apn ?? "Sin especificar"} mono />
        <Resumen label="Observaciones" valor={simCard.observaciones ?? "—"} />
      </div>

      {/* Acciones */}
      {puedeEditar && (
        <div className="flex flex-wrap gap-3 mb-8">
          <ActionButton onClick={() => setPanel("estado")}>Cambiar estado</ActionButton>
          <ActionButton onClick={() => setPanel("numero")}>Reasignar número corto</ActionButton>
          <ActionButton onClick={() => setPanel("cliente")}>Reasignar a otro cliente</ActionButton>
          <ActionButton onClick={() => setPanel("detalles")}>Editar APN / observaciones</ActionButton>
        </div>
      )}

      {panel === "estado" && (
        <PanelEstado simId={simCard.id} onClose={() => setPanel(null)} />
      )}
      {panel === "numero" && (
        <PanelNumero simId={simCard.id} actual={current?.numero_corto_actual ?? null} onClose={() => setPanel(null)} />
      )}
      {panel === "cliente" && (
        <PanelCliente simId={simCard.id} comerciales={comerciales} brokers={brokers} clientes={clientes} onClose={() => setPanel(null)} />
      )}
      {panel === "detalles" && (
        <PanelDetalles simId={simCard.id} apnActual={simCard.apn} observacionesActual={simCard.observaciones} apns={apns} onClose={() => setPanel(null)} />
      )}

      {/* Hoja de vida */}
      <h2 className="font-display text-lg font-semibold mb-4">Hoja de vida</h2>
      <div className="rounded-xl border bg-white p-2" style={{ borderColor: "var(--border)" }}>
        {eventos.map((ev, i) => (
          <div
            key={i}
            className="flex gap-4 px-4 py-4 border-b last:border-0"
            style={{ borderColor: "var(--border)" }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5"
              style={{ background: "var(--chip-gold-soft)", color: "var(--chip-gold)" }}
            >
              {EVENT_ICON[ev.tipo]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{ev.titulo}</p>
                <p className="text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                  {formatFechaHora(ev.fecha)}
                </p>
              </div>
              {ev.detalle && (
                <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>{ev.detalle}</p>
              )}
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                Registrado por {ev.usuario_nombre}
              </p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function Resumen({ label, valor, mono }: { label: string; valor: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
      <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className={`text-sm font-medium ${mono ? "font-mono" : ""}`}>{valor}</p>
    </div>
  );
}

function ActionButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border px-4 py-2 text-sm font-medium bg-white"
      style={{ borderColor: "var(--border)" }}
    >
      {children}
    </button>
  );
}

function PanelWrapper({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-6 mb-8" style={{ borderColor: "var(--chip-gold)" }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-base font-semibold">{title}</h3>
        <button onClick={onClose} className="text-sm" style={{ color: "var(--text-secondary)" }}>Cerrar</button>
      </div>
      {children}
    </div>
  );
}

function PanelEstado({ simId, onClose }: { simId: string; onClose: () => void }) {
  const [estado, setEstado] = useState<EstadoSim>(ESTADOS_SIM[0]);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <PanelWrapper title="Cambiar estado" onClose={onClose}>
      <div className="flex flex-col gap-3 max-w-md">
        <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoSim)} className="input">
          {ESTADOS_SIM.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota (opcional)"
          className="input"
        />
        {error && <p className="text-sm" style={{ color: "var(--state-desactivada)" }}>{error}</p>}
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await cambiarEstado(simId, estado, nota);
              if (res?.error) setError(res.error);
              else onClose();
            })
          }
          className="rounded-lg py-2 text-sm font-semibold text-white self-start px-4"
          style={{ background: "var(--ink-900)" }}
        >
          {isPending ? "Guardando…" : "Guardar cambio de estado"}
        </button>
      </div>
      <style jsx global>{`.input { width: 100%; border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.55rem 0.75rem; font-size: 0.875rem; }`}</style>
    </PanelWrapper>
  );
}

function PanelNumero({ simId, actual, onClose }: { simId: string; actual: string | null; onClose: () => void }) {
  const [numero, setNumero] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <PanelWrapper title="Reasignar número corto" onClose={onClose}>
      <div className="flex flex-col gap-3 max-w-md">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Número corto actual: <span className="font-mono">{actual ?? "ninguno"}</span>
        </p>
        <input
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          placeholder="Nuevo número corto"
          className="input font-mono"
        />
        {error && <p className="text-sm" style={{ color: "var(--state-desactivada)" }}>{error}</p>}
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await asignarNumeroCorto(simId, numero);
              if (res?.error) setError(res.error);
              else onClose();
            })
          }
          className="rounded-lg py-2 text-sm font-semibold text-white self-start px-4"
          style={{ background: "var(--ink-900)" }}
        >
          {isPending ? "Guardando…" : "Guardar número corto"}
        </button>
      </div>
      <style jsx global>{`.input { width: 100%; border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.55rem 0.75rem; font-size: 0.875rem; }`}</style>
    </PanelWrapper>
  );
}

function PanelDetalles({
  simId,
  apnActual,
  observacionesActual,
  apns,
  onClose,
}: {
  simId: string;
  apnActual: string | null;
  observacionesActual: string | null;
  apns: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [apn, setApn] = useState(apnActual ?? "");
  const [observaciones, setObservaciones] = useState(observacionesActual ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <PanelWrapper title="Editar APN / observaciones" onClose={onClose}>
      <div className="flex flex-col gap-3 max-w-md">
        <select value={apn} onChange={(e) => setApn(e.target.value)} className="input">
          <option value="">Sin especificar</option>
          {apns.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
        </select>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={3}
          placeholder="Observaciones (opcional)"
          className="input"
        />
        {error && <p className="text-sm" style={{ color: "var(--state-desactivada)" }}>{error}</p>}
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await actualizarDetalles(simId, { apn: apn || null, observaciones: observaciones || null });
              if (res?.error) setError(res.error);
              else onClose();
            })
          }
          className="rounded-lg py-2 text-sm font-semibold text-white self-start px-4"
          style={{ background: "var(--ink-900)" }}
        >
          {isPending ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
      <style jsx global>{`.input { width: 100%; border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.55rem 0.75rem; font-size: 0.875rem; }`}</style>
    </PanelWrapper>
  );
}

function PanelCliente({
  simId,
  comerciales,
  brokers,
  clientes,
  onClose,
}: {
  simId: string;
  comerciales: Profile[];
  brokers: Profile[];
  clientes: ClienteOpcion[];
  onClose: () => void;
}) {
  const [form, setForm] = useState<ReasignacionInput>({
    cliente_nombre: "",
    plan_unidad: "Gigas",
    plan_cantidad: "",
    tipo_plan: "Prepago",
    pago_momento: "Anticipado",
    duracion_meses: "12",
    precio_cliente: "",
    fecha_entrega: new Date().toISOString().slice(0, 10),
    comercial_id: "",
    broker_id: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function patch(p: Partial<ReasignacionInput>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  return (
    <PanelWrapper title="Reasignar a otro cliente" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3 max-w-2xl">
        <div className="col-span-2">
          <ClienteAutocomplete value={form.cliente_nombre} onChange={(v) => patch({ cliente_nombre: v })} clientes={clientes} placeholder="Nombre del cliente" />
        </div>

        <select className="input" value={form.tipo_plan} onChange={(e) => patch({ tipo_plan: e.target.value })}>
          <option value="Prepago">Prepago</option>
          <option value="Postpago">Postpago</option>
        </select>
        <select className="input" value={form.pago_momento} onChange={(e) => patch({ pago_momento: e.target.value })}>
          <option value="Anticipado">Anticipado</option>
          <option value="Mes vencido">Mes vencido (factura)</option>
        </select>

        {form.tipo_plan === "Prepago" && (
          <select className="input" value={form.duracion_meses} onChange={(e) => patch({ duracion_meses: e.target.value })}>
            <option value="6">Duración: 6 meses</option>
            <option value="12">Duración: 12 meses</option>
          </select>
        )}

        <input className="input" type="number" placeholder="Cantidad de datos" value={form.plan_cantidad} onChange={(e) => patch({ plan_cantidad: e.target.value })} />
        <select className="input" value={form.plan_unidad} onChange={(e) => patch({ plan_unidad: e.target.value })}>
          <option value="Megas">Megas</option>
          <option value="Gigas">Gigas</option>
        </select>

        <input className="input" type="number" placeholder="Precio a cliente (COP)" value={form.precio_cliente} onChange={(e) => patch({ precio_cliente: e.target.value })} />
        <input className="input" type="date" value={form.fecha_entrega} onChange={(e) => patch({ fecha_entrega: e.target.value })} />

        <select className="input" value={form.comercial_id} onChange={(e) => patch({ comercial_id: e.target.value })}>
          <option value="">Comercial que entrega…</option>
          {comerciales.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </select>
        <select className="input" value={form.broker_id} onChange={(e) => patch({ broker_id: e.target.value })}>
          <option value="">Sin broker</option>
          {brokers.map((b) => <option key={b.id} value={b.id}>{b.full_name}</option>)}
        </select>
      </div>

      {error && <p className="text-sm mt-3" style={{ color: "var(--state-desactivada)" }}>{error}</p>}

      <button
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await reasignarCliente(simId, form);
            if (res?.error) setError(res.error);
            else onClose();
          })
        }
        className="rounded-lg py-2 text-sm font-semibold text-white mt-4 px-4"
        style={{ background: "var(--ink-900)" }}
      >
        {isPending ? "Guardando…" : "Guardar reasignación"}
      </button>
      <style jsx global>{`.input { width: 100%; border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.55rem 0.75rem; font-size: 0.875rem; }`}</style>
    </PanelWrapper>
  );
}
