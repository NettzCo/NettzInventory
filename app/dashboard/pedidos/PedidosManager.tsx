"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Pedido } from "@/lib/types";
import { formatFechaHora } from "@/lib/ui";
import { crearPedido, editarPedido, eliminarPedido, marcarPedidoEnviado, rechazarPedido, subirComprobante, PedidoInput } from "./actions";

interface Opcion {
  id: string;
  nombre?: string;
  full_name?: string;
  name?: string;
}

const CAMPOS_VACIOS: PedidoInput = {
  cliente_id: "",
  cliente_nombre: "",
  cantidad: "",
  proveedor: "",
  apn: "",
  pais: "Colombia",
  ciudad: "",
  direccion: "",
  contacto_nombre: "",
  contacto_telefono: "",
  contacto_correo: "",
  asignado_a: "",
  observaciones: "",
};

function pedidoToInput(p: Pedido): PedidoInput {
  return {
    cliente_id: p.cliente_id ?? "",
    cliente_nombre: p.cliente_nombre,
    cantidad: String(p.cantidad),
    proveedor: p.proveedor,
    apn: p.apn ?? "",
    pais: p.pais,
    ciudad: p.ciudad,
    direccion: p.direccion,
    contacto_nombre: p.contacto_nombre,
    contacto_telefono: p.contacto_telefono,
    contacto_correo: p.contacto_correo ?? "",
    asignado_a: p.asignado_a,
    observaciones: p.observaciones ?? "",
  };
}

export default function PedidosManager({
  pedidos,
  clientes,
  proveedores,
  apns,
  usuarios,
  currentUserId,
  esSuperAdmin,
  organizationId,
}: {
  pedidos: Pedido[];
  clientes: Opcion[];
  proveedores: Opcion[];
  apns: Opcion[];
  usuarios: Opcion[];
  currentUserId: string;
  esSuperAdmin: boolean;
  organizationId: string;
}) {
  const [filtro, setFiltro] = useState<"todos" | "pendientes" | "enviados" | "rechazados">("todos");
  const [lista, setLista] = useState(pedidos);

  // Refleja al instante (sin recargar) cuando alguien más marca un pedido
  // como visto o como enviado — así el doble check se actualiza solo.
  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel(`pedidos-lista-${organizationId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pedidos", filter: `organization_id=eq.${organizationId}` },
        (payload) => {
          const actualizado = payload.new as Pedido;
          setLista((prev) => prev.map((p) => (p.id === actualizado.id ? actualizado : p)));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, [organizationId]);

  const visibles = lista.filter((p) => {
    if (filtro === "pendientes") return p.estado === "Pendiente";
    if (filtro === "enviados") return p.estado === "Enviado";
    if (filtro === "rechazados") return p.estado === "Rechazado";
    return true;
  });

  const nombreUsuario = new Map(usuarios.map((u) => [u.id, u.full_name ?? ""]));

  function actualizarEnLista(actualizado: Pedido) {
    setLista((prev) => prev.map((p) => (p.id === actualizado.id ? actualizado : p)));
  }
  function quitarDeLista(id: string) {
    setLista((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="flex flex-col gap-8">
      <form action="/dashboard/pedidos/exportar" method="get" className="flex flex-wrap items-end justify-end gap-3">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Estado</label>
          <select name="estado" className="input-filter" defaultValue="">
            <option value="">Todos</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Enviado">Enviado</option>
            <option value="Rechazado">Rechazado</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Desde</label>
          <input type="date" name="desde" className="input-filter" />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Hasta</label>
          <input type="date" name="hasta" className="input-filter" />
        </div>
        <button
          type="submit"
          className="rounded-lg border px-4 py-2 text-sm font-medium bg-white hover:underline cursor-pointer"
          style={{ borderColor: "var(--border)" }}
        >
          {"\u2B07"} Descargar pedidos
        </button>
      </form>

      <FormularioPedido clientes={clientes} proveedores={proveedores} apns={apns} usuarios={usuarios} onCreado={(p) => setLista((prev) => [p, ...prev])} />

      <section className="rounded-xl border bg-white overflow-x-auto" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-display text-base font-semibold">Pedidos registrados</h2>
          <div className="flex gap-2">
            {(["todos", "pendientes", "enviados", "rechazados"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium capitalize"
                style={{
                  background: filtro === f ? "var(--ink-900)" : "white",
                  color: filtro === f ? "white" : "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <table className="w-full text-sm" style={{ minWidth: "1300px" }}>
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Fecha</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Cliente</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Cantidad</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Proveedor</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Destino</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Recibe</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Asignado a</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => (
              <FilaPedido
                key={p.id}
                pedido={p}
                currentUserId={currentUserId}
                esSuperAdmin={esSuperAdmin}
                nombreAsignado={nombreUsuario.get(p.asignado_a) ?? "Usuario"}
                clientes={clientes}
                proveedores={proveedores}
                apns={apns}
                usuarios={usuarios}
                onActualizado={actualizarEnLista}
                onEliminado={quitarDeLista}
              />
            ))}
          </tbody>
        </table>
        {visibles.length === 0 && (
          <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No hay pedidos {filtro !== "todos" ? filtro : "registrados todavía"}.
          </div>
        )}
      </section>
      <style jsx global>{`.input { width: 100%; border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.55rem 0.75rem; font-size: 0.875rem; }`}</style>
    </div>
  );
}

function CamposPedido({
  form,
  patch,
  clientes,
  proveedores,
  apns,
  usuarios,
}: {
  form: PedidoInput;
  patch: (p: Partial<PedidoInput>) => void;
  clientes: Opcion[];
  proveedores: Opcion[];
  apns: Opcion[];
  usuarios: Opcion[];
}) {
  function handleClienteChange(id: string) {
    const cliente = clientes.find((c) => c.id === id);
    patch({ cliente_id: id, cliente_nombre: cliente?.nombre ?? "" });
  }

  return (
    <>
      <select className="input col-span-2" value={form.cliente_id} onChange={(e) => handleClienteChange(e.target.value)} required>
        <option value="">Cliente que hace el pedido *</option>
        {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>

      <input
        className="input"
        type="number"
        min={1}
        placeholder="Cantidad de SIM cards *"
        value={form.cantidad}
        onChange={(e) => patch({ cantidad: e.target.value })}
        required
      />

      <select className="input" value={form.proveedor} onChange={(e) => patch({ proveedor: e.target.value })} required>
        <option value="">Operador *</option>
        {proveedores.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
      </select>

      <select className="input" value={form.apn} onChange={(e) => patch({ apn: e.target.value })}>
        <option value="">APN (sin especificar)</option>
        {apns.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
      </select>

      <select className="input" value={form.asignado_a} onChange={(e) => patch({ asignado_a: e.target.value })} required>
        <option value="">Asignar a *</option>
        {usuarios.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
      </select>

      <input className="input" placeholder="País *" value={form.pais} onChange={(e) => patch({ pais: e.target.value })} required />
      <input className="input" placeholder="Ciudad *" value={form.ciudad} onChange={(e) => patch({ ciudad: e.target.value })} required />
      <input className="input col-span-2" placeholder="Dirección de envío *" value={form.direccion} onChange={(e) => patch({ direccion: e.target.value })} required />

      <input className="input" placeholder="Persona que recibe *" value={form.contacto_nombre} onChange={(e) => patch({ contacto_nombre: e.target.value })} required />
      <input className="input" placeholder="Teléfono de quien recibe *" value={form.contacto_telefono} onChange={(e) => patch({ contacto_telefono: e.target.value })} required />
      <input className="input col-span-2" type="email" placeholder="Correo de quien recibe (opcional)" value={form.contacto_correo} onChange={(e) => patch({ contacto_correo: e.target.value })} />

      <textarea className="input col-span-2" rows={2} placeholder="Observaciones (opcional)" value={form.observaciones} onChange={(e) => patch({ observaciones: e.target.value })} />
    </>
  );
}

function FormularioPedido({
  clientes,
  proveedores,
  apns,
  usuarios,
  onCreado,
}: {
  clientes: Opcion[];
  proveedores: Opcion[];
  apns: Opcion[];
  usuarios: Opcion[];
  onCreado: (p: Pedido) => void;
}) {
  const [form, setForm] = useState<PedidoInput>(CAMPOS_VACIOS);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function patch(p: Partial<PedidoInput>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const res = await crearPedido(form);
      if (res?.error) {
        setError(res.error);
      } else {
        setSuccess(true);
        setForm(CAMPOS_VACIOS);
        // El servidor ya guardó el pedido; refrescamos la lista visualmente
        // con un valor optimista mínimo — la próxima recarga trae el real.
        onCreado({
          id: crypto.randomUUID(),
          organization_id: "",
          cliente_id: form.cliente_id || null,
          cliente_nombre: form.cliente_nombre,
          cantidad: Number(form.cantidad),
          proveedor: form.proveedor,
          apn: form.apn || null,
          pais: form.pais,
          ciudad: form.ciudad,
          direccion: form.direccion,
          contacto_nombre: form.contacto_nombre,
          contacto_telefono: form.contacto_telefono,
          contacto_correo: form.contacto_correo || null,
          asignado_a: form.asignado_a,
          estado: "Pendiente",
          observaciones: form.observaciones || null,
          comprobante_url: null,
          visto_at: null,
          motivo_rechazo: null,
          rechazado_at: null,
          rechazado_by: null,
          created_at: new Date().toISOString(),
          created_by: "",
          enviado_at: null,
          enviado_by: null,
        });
      }
    });
  }

  return (
    <section className="rounded-xl border bg-white p-6" style={{ borderColor: "var(--border)" }}>
      <h2 className="font-display text-base font-semibold mb-1">Registrar pedido</h2>
      <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
        Se registra con la fecha y hora actuales automáticamente.
      </p>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 max-w-3xl">
        <CamposPedido form={form} patch={patch} clientes={clientes} proveedores={proveedores} apns={apns} usuarios={usuarios} />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg py-2 text-sm font-semibold text-white px-4 self-start col-span-2"
          style={{ background: "var(--ink-900)", width: "fit-content" }}
        >
          {isPending ? "Guardando…" : "Registrar pedido"}
        </button>
      </form>
      {error && <p className="text-sm mt-3" style={{ color: "var(--state-desactivada)" }}>{error}</p>}
      {success && <p className="text-sm mt-3" style={{ color: "var(--state-activa)" }}>Pedido registrado — se le avisó a la persona asignada.</p>}
    </section>
  );
}

function FilaPedido({
  pedido,
  currentUserId,
  esSuperAdmin,
  nombreAsignado,
  clientes,
  proveedores,
  apns,
  usuarios,
  onActualizado,
  onEliminado,
}: {
  pedido: Pedido;
  currentUserId: string;
  esSuperAdmin: boolean;
  nombreAsignado: string;
  clientes: Opcion[];
  proveedores: Opcion[];
  apns: Opcion[];
  usuarios: Opcion[];
  onActualizado: (p: Pedido) => void;
  onEliminado: (id: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [confirmandoEnvio, setConfirmandoEnvio] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [form, setForm] = useState<PedidoInput>(pedidoToInput(pedido));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const puedeEditar = pedido.created_by === currentUserId || esSuperAdmin;
  const puedeConfirmarEnvio = pedido.asignado_a === currentUserId || esSuperAdmin;

  function patch(p: Partial<PedidoInput>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  function guardarEdicion() {
    setError(null);
    startTransition(async () => {
      const res = await editarPedido(pedido.id, form);
      if (res?.error) setError(res.error);
      else {
        onActualizado({ ...pedido, ...form, cliente_id: form.cliente_id || null, cantidad: Number(form.cantidad), apn: form.apn || null, contacto_correo: form.contacto_correo || null, observaciones: form.observaciones || null });
        setEditando(false);
      }
    });
  }

  function eliminar() {
    if (!confirm(`¿Eliminar el pedido de "${pedido.cliente_nombre}"? Esta acción no se puede deshacer.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await eliminarPedido(pedido.id);
      if (res?.error) setError(res.error);
      else onEliminado(pedido.id);
    });
  }

  if (editando) {
    return (
      <tr className="border-b last:border-0 align-top" style={{ borderColor: "var(--border)" }}>
        <td colSpan={9} className="px-6 py-4" style={{ background: "var(--bg)" }}>
          <div className="grid grid-cols-2 gap-3 max-w-3xl">
            <CamposPedido form={form} patch={patch} clientes={clientes} proveedores={proveedores} apns={apns} usuarios={usuarios} />
          </div>
          {error && <p className="text-sm mt-2" style={{ color: "var(--state-desactivada)" }}>{error}</p>}
          <div className="flex gap-3 mt-3">
            <button onClick={guardarEdicion} disabled={isPending} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--ink-900)" }}>
              {isPending ? "Guardando…" : "Guardar cambios"}
            </button>
            <button onClick={() => { setEditando(false); setForm(pedidoToInput(pedido)); setError(null); }} disabled={isPending} className="rounded-lg border px-4 py-2 text-sm font-medium" style={{ borderColor: "var(--border)" }}>
              Cancelar
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className="border-b last:border-0" style={{ borderColor: confirmandoEnvio ? "transparent" : "var(--border)" }}>
        <td className="px-4 py-3 whitespace-nowrap">{formatFechaHora(pedido.created_at)}</td>
        <td className="px-4 py-3">{pedido.cliente_nombre}</td>
        <td className="px-4 py-3">{pedido.cantidad}</td>
        <td className="px-4 py-3 whitespace-nowrap">{pedido.proveedor}</td>
        <td className="px-4 py-3">
          <div>{pedido.ciudad}, {pedido.pais}</div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{pedido.direccion}</div>
        </td>
        <td className="px-4 py-3">
          <div>{pedido.contacto_nombre}</div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{pedido.contacto_telefono}</div>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">{nombreAsignado}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span
              className="status-pill"
              style={{
                background: pedido.estado === "Enviado" ? "#E7F5EC" : pedido.estado === "Rechazado" ? "#FDEAEA" : "#FDF3E4",
                color: pedido.estado === "Enviado" ? "var(--state-activa)" : pedido.estado === "Rechazado" ? "var(--state-desactivada)" : "var(--state-lista)",
              }}
            >
              {pedido.estado}
            </span>
            {pedido.estado !== "Rechazado" && (
              <span
                title={pedido.estado === "Enviado" ? "Enviado" : pedido.visto_at ? "Visto por la persona asignada" : "Todavía no lo ha visto"}
                style={{ color: pedido.estado === "Enviado" ? "var(--state-activa)" : pedido.visto_at ? "var(--chip-gold)" : "var(--text-muted)", fontSize: "0.8rem" }}
              >
                {pedido.estado === "Enviado" || pedido.visto_at ? "✓✓" : "✓"}
              </span>
            )}
          </div>
          {pedido.estado === "Enviado" && pedido.enviado_at && (
            <div style={{ color: "var(--text-muted)", fontSize: "0.7rem" }} className="mt-1">
              {formatFechaHora(pedido.enviado_at)}
            </div>
          )}
          {pedido.estado === "Rechazado" && pedido.motivo_rechazo && (
            <div style={{ color: "var(--state-desactivada)", fontSize: "0.75rem", maxWidth: "14rem" }} className="mt-1">
              &ldquo;{pedido.motivo_rechazo}&rdquo;
            </div>
          )}
          {pedido.comprobante_url && (
            <a href={pedido.comprobante_url} target="_blank" rel="noreferrer" className="text-xs block mt-1" style={{ color: "var(--text-secondary)" }}>
              Ver comprobante
            </a>
          )}
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          <div className="flex flex-col gap-1 items-end">
            {pedido.estado === "Pendiente" && puedeConfirmarEnvio && (
              <button onClick={() => setConfirmandoEnvio((v) => !v)} disabled={isPending} className="text-sm font-medium hover:underline cursor-pointer" style={{ color: "var(--state-activa)" }}>
                Marcar como enviado
              </button>
            )}
            {pedido.estado === "Pendiente" && puedeConfirmarEnvio && (
              <button onClick={() => setRechazando((v) => !v)} disabled={isPending} className="text-sm font-medium hover:underline cursor-pointer" style={{ color: "var(--state-desactivada)" }}>
                Rechazar
              </button>
            )}
            {puedeEditar && (
              <button onClick={() => setEditando(true)} disabled={isPending} className="text-sm hover:underline cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                Editar
              </button>
            )}
            {puedeEditar && (
              <button onClick={eliminar} disabled={isPending} className="text-sm hover:underline cursor-pointer" style={{ color: "var(--state-desactivada)" }}>
                Eliminar
              </button>
            )}
          </div>
          {error && <p className="text-xs mt-1" style={{ color: "var(--state-desactivada)" }}>{error}</p>}
        </td>
      </tr>
      {confirmandoEnvio && (
        <ConfirmarEnvioRow
          pedidoId={pedido.id}
          onCancelar={() => setConfirmandoEnvio(false)}
          onConfirmado={(actualizado) => { onActualizado(actualizado); setConfirmandoEnvio(false); }}
          pedidoBase={pedido}
        />
      )}
      {rechazando && (
        <RechazarPedidoRow
          pedidoId={pedido.id}
          onCancelar={() => setRechazando(false)}
          onRechazado={(actualizado) => { onActualizado(actualizado); setRechazando(false); }}
          pedidoBase={pedido}
        />
      )}
    </>
  );
}

function ConfirmarEnvioRow({
  pedidoId,
  pedidoBase,
  onCancelar,
  onConfirmado,
}: {
  pedidoId: string;
  pedidoBase: Pedido;
  onCancelar: () => void;
  onConfirmado: (p: Pedido) => void;
}) {
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function confirmar() {
    setError(null);
    startTransition(async () => {
      let comprobanteUrl: string | null = null;

      if (archivo) {
        const formData = new FormData();
        formData.append("file", archivo);
        const subida = await subirComprobante(pedidoId, formData);
        if (subida.error) { setError(subida.error); return; }
        comprobanteUrl = subida.url ?? null;
      }

      const res = await marcarPedidoEnviado(pedidoId, fecha, comprobanteUrl);
      if (res?.error) { setError(res.error); return; }

      onConfirmado({ ...pedidoBase, estado: "Enviado", enviado_at: new Date(fecha).toISOString(), comprobante_url: comprobanteUrl });
    });
  }

  return (
    <tr className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <td colSpan={9} className="px-6 py-4" style={{ background: "var(--bg)" }}>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Fecha de envío</label>
            <input type="date" className="input" style={{ width: "auto" }} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Comprobante (opcional — imagen o PDF)</label>
            <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="text-sm" />
          </div>
          <button onClick={confirmar} disabled={isPending} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 hover:underline cursor-pointer" style={{ background: "var(--state-activa)" }}>
            {isPending ? "Guardando…" : "Confirmar envío"}
          </button>
          <button onClick={onCancelar} disabled={isPending} className="rounded-lg border px-4 py-2 text-sm font-medium hover:underline cursor-pointer" style={{ borderColor: "var(--border)" }}>
            Cancelar
          </button>
        </div>
        {error && <p className="text-sm mt-2" style={{ color: "var(--state-desactivada)" }}>{error}</p>}
      </td>
    </tr>
  );
}

function RechazarPedidoRow({
  pedidoId,
  pedidoBase,
  onCancelar,
  onRechazado,
}: {
  pedidoId: string;
  pedidoBase: Pedido;
  onCancelar: () => void;
  onRechazado: (p: Pedido) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirmar() {
    setError(null);
    if (!motivo.trim()) {
      setError("Debes indicar el motivo del rechazo.");
      return;
    }
    startTransition(async () => {
      const res = await rechazarPedido(pedidoId, motivo);
      if (res?.error) { setError(res.error); return; }
      onRechazado({
        ...pedidoBase,
        estado: "Rechazado",
        motivo_rechazo: motivo.trim(),
        rechazado_at: new Date().toISOString(),
      });
    });
  }

  return (
    <tr className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <td colSpan={9} className="px-6 py-4" style={{ background: "var(--bg)" }}>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>
          Motivo del rechazo (obligatorio)
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <textarea
            className="input"
            style={{ maxWidth: "28rem" }}
            rows={2}
            placeholder="Ej: no hay inventario de este operador, faltan datos de contacto, etc."
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <button onClick={confirmar} disabled={isPending} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 hover:underline cursor-pointer" style={{ background: "var(--state-desactivada)" }}>
            {isPending ? "Guardando…" : "Confirmar rechazo"}
          </button>
          <button onClick={onCancelar} disabled={isPending} className="rounded-lg border px-4 py-2 text-sm font-medium hover:underline cursor-pointer" style={{ borderColor: "var(--border)" }}>
            Cancelar
          </button>
        </div>
        {error && <p className="text-sm mt-2" style={{ color: "var(--state-desactivada)" }}>{error}</p>}
      </td>
    </tr>
  );
}
