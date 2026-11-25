"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Pedido, PedidoEnvio, ESTADOS_SIM } from "@/lib/types";
import { formatFechaHora, hoyColombia } from "@/lib/ui";
import { crearPedido, editarPedido, eliminarPedido, registrarEnvio, actualizarEnvio, eliminarEnvio, rechazarPedido, subirComprobante, PedidoInput, EnvioInput, PlanClienteInput } from "./actions";
import { traducirError } from "@/lib/friendlyError";

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
  total,
  pagina,
  porPagina,
  busqueda,
  estadoFiltro,
  clientes,
  proveedores,
  apns,
  usuarios,
  currentUserId,
  esSuperAdmin,
  organizationId,
}: {
  pedidos: Pedido[];
  total: number;
  pagina: number;
  porPagina: number;
  busqueda: string;
  estadoFiltro: string;
  clientes: Opcion[];
  proveedores: Opcion[];
  apns: Opcion[];
  usuarios: Opcion[];
  currentUserId: string;
  esSuperAdmin: boolean;
  organizationId: string;
}) {
  const [lista, setLista] = useState(pedidos);
  const [totalActual, setTotalActual] = useState(total);

  // Refleja al instante (sin recargar) los cambios de otras personas: pedidos
  // nuevos, pedidos que cambian de estado o se marcan como vistos, y envíos
  // (guías) que se agregan, editan o quitan.
  useEffect(() => {
    const supabase = createClient();
    const sinFiltros = pagina === 1 && !busqueda;
    const canal = supabase
      .channel(`pedidos-lista-${organizationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pedidos", filter: `organization_id=eq.${organizationId}` },
        (payload) => {
          const nuevo = { ...(payload.new as Pedido), envios: [] };
          if (!sinFiltros || (estadoFiltro && estadoFiltro !== nuevo.estado)) return;
          setLista((prev) => (prev.some((p) => p.id === nuevo.id) ? prev : [nuevo, ...prev].slice(0, porPagina)));
          setTotalActual((t) => t + 1);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pedidos", filter: `organization_id=eq.${organizationId}` },
        (payload) => {
          const actualizado = payload.new as Pedido;
          setLista((prev) => prev.map((p) => (p.id === actualizado.id ? { ...p, ...actualizado, envios: p.envios } : p)));
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedido_envios", filter: `organization_id=eq.${organizationId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string }).id;
            if (!id) return;
            setLista((prev) => prev.map((p) => ({ ...p, envios: (p.envios ?? []).filter((e) => e.id !== id) })));
            return;
          }
          const envio = payload.new as PedidoEnvio;
          setLista((prev) =>
            prev.map((p) => {
              if (p.id !== envio.pedido_id) return p;
              const otros = (p.envios ?? []).filter((e) => e.id !== envio.id);
              return { ...p, envios: [...otros, envio].sort((x, y) => x.fecha_envio.localeCompare(y.fecha_envio)) };
            })
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, [organizationId, pagina, busqueda, estadoFiltro, porPagina]);

  const visibles = lista;
  const totalPaginas = Math.max(1, Math.ceil(totalActual / porPagina));
  const href = (cambios: { estado?: string; pagina?: number; q?: string }) => {
    const params = new URLSearchParams();
    const e = cambios.estado !== undefined ? cambios.estado : estadoFiltro;
    const qActual = cambios.q !== undefined ? cambios.q : busqueda;
    if (qActual) params.set("q", qActual);
    if (e) params.set("estado", e);
    const pg = cambios.pagina ?? (cambios.estado !== undefined ? 1 : pagina);
    if (pg > 1) params.set("pagina", String(pg));
    const qs = params.toString();
    return `/dashboard/pedidos${qs ? `?${qs}` : ""}`;
  };

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
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-display text-base font-semibold">Pedidos registrados ({totalActual})</h2>
          <div className="flex flex-wrap items-center gap-2">
            <form action="/dashboard/pedidos" method="get" className="flex gap-2">
              {estadoFiltro && <input type="hidden" name="estado" value={estadoFiltro} />}
              <input
                type="search"
                name="q"
                defaultValue={busqueda}
                placeholder="Cliente, ciudad, guía o ICC"
                aria-label="Buscar pedidos"
                className="input-filter"
                style={{ width: "15rem" }}
              />
              <button type="submit" className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:underline cursor-pointer" style={{ borderColor: "var(--border)" }}>
                Buscar
              </button>
              {busqueda && (
                <Link href={href({ q: "", pagina: 1 })} className="rounded-lg px-3 py-1.5 text-sm hover:underline" style={{ color: "var(--text-secondary)" }}>
                  Limpiar
                </Link>
              )}
            </form>
            {([["", "Todos"], ["Pendiente", "Pendientes"], ["Enviado", "Enviados"], ["Rechazado", "Rechazados"]] as const).map(([valor, etiqueta]) => (
              <Link
                key={valor || "todos"}
                href={href({ estado: valor })}
                className="rounded-lg px-3 py-1.5 text-sm font-medium"
                style={{
                  background: estadoFiltro === valor ? "var(--ink-900)" : "white",
                  color: estadoFiltro === valor ? "white" : "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
              >
                {etiqueta}
              </Link>
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
            {busqueda || estadoFiltro ? "Ningún pedido coincide con la búsqueda o el filtro." : "No hay pedidos registrados todavía."}
          </div>
        )}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t text-sm" style={{ borderColor: "var(--border)" }}>
            <span style={{ color: "var(--text-secondary)" }}>Página {pagina} de {totalPaginas}</span>
            <div className="flex gap-2">
              {pagina > 1 && <Link href={href({ pagina: pagina - 1 })} className="rounded-lg border px-3 py-1.5 hover:underline" style={{ borderColor: "var(--border)" }}>Anterior</Link>}
              {pagina < totalPaginas && <Link href={href({ pagina: pagina + 1 })} className="rounded-lg border px-3 py-1.5 hover:underline" style={{ borderColor: "var(--border)" }}>Siguiente</Link>}
            </div>
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
        setError(traducirError(res.error));
      } else {
        setSuccess(true);
        setForm(CAMPOS_VACIOS);
        // Se usa el pedido real que devolvió el servidor (con su id verdadero),
        // para poder marcarlo como enviado o editarlo sin recargar la página.
        if (res.pedido) onCreado({ ...res.pedido, envios: [] });
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
  // null = cerrado, "nuevo" = registrar una guía, o el envío que se está editando
  const [formEnvio, setFormEnvio] = useState<null | "nuevo" | PedidoEnvio>(null);
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
      if (res?.error) setError(traducirError(res.error));
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
      if (res?.error) setError(traducirError(res.error));
      else onEliminado(pedido.id);
    });
  }

  function quitarEnvio(envio: PedidoEnvio) {
    if (!confirm(`¿Quitar la guía${envio.numero_guia ? ` ${envio.numero_guia}` : ""}? Esta acción no se puede deshacer.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await eliminarEnvio(envio.id);
      if (res?.error) setError(traducirError(res.error));
      else onActualizado({ ...pedido, envios: (pedido.envios ?? []).filter((e) => e.id !== envio.id) });
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
      <tr className="border-b last:border-0" style={{ borderColor: formEnvio ? "transparent" : "var(--border)" }}>
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
          {(pedido.envios ?? []).length > 0 && (
            <ul className="mt-2 flex flex-col gap-2" style={{ maxWidth: "18rem" }}>
              {(pedido.envios ?? []).map((envio) => (
                <li key={envio.id} className="text-xs rounded-md border px-2 py-1.5" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                  <div className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {[envio.transportadora, envio.numero_guia && `Guía ${envio.numero_guia}`].filter(Boolean).join(" · ") || "Envío sin guía"}
                  </div>
                  <div>
                    {formatFechaHora(envio.fecha_envio)}
                    {envio.valor_envio !== null && ` · $${Number(envio.valor_envio).toLocaleString("es-CO")}`}
                    {envio.iccs.length > 0 && ` · ${envio.iccs.length} SIM`}
                  </div>
                  <div className="flex gap-3 mt-0.5">
                    {envio.comprobante_url && (
                      <a href={envio.comprobante_url} target="_blank" rel="noreferrer" className="hover:underline">Ver guía</a>
                    )}
                    {puedeConfirmarEnvio && pedido.estado !== "Rechazado" && (
                      <>
                        <button onClick={() => setFormEnvio(envio)} disabled={isPending} className="hover:underline cursor-pointer">Editar</button>
                        <button onClick={() => quitarEnvio(envio)} disabled={isPending} className="hover:underline cursor-pointer" style={{ color: "var(--state-desactivada)" }}>Quitar</button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {pedido.comprobante_url && (pedido.envios ?? []).length === 0 && (
            <a href={pedido.comprobante_url} target="_blank" rel="noreferrer" className="text-xs block mt-1" style={{ color: "var(--text-secondary)" }}>
              Ver comprobante
            </a>
          )}
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          <div className="flex flex-col gap-1 items-end">
            {(pedido.estado === "Pendiente" || pedido.estado === "Enviado") && puedeConfirmarEnvio && (
              <button onClick={() => setFormEnvio((v) => (v ? null : "nuevo"))} disabled={isPending} className="text-sm font-medium hover:underline cursor-pointer" style={{ color: "var(--state-activa)" }}>
                {pedido.estado === "Pendiente" ? "Marcar como enviado" : "Agregar guía"}
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
      {formEnvio && (
        <EnvioFormRow
          pedido={pedido}
          comerciales={usuarios}
          envio={formEnvio === "nuevo" ? null : formEnvio}
          onCancelar={() => setFormEnvio(null)}
          onGuardado={(actualizado) => { onActualizado(actualizado); setFormEnvio(null); }}
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

function EnvioFormRow({
  pedido,
  comerciales,
  envio,
  onCancelar,
  onGuardado,
}: {
  pedido: Pedido;
  comerciales: Opcion[];
  envio: PedidoEnvio | null; // null = guía nueva
  onCancelar: () => void;
  onGuardado: (p: Pedido) => void;
}) {
  const [form, setForm] = useState<EnvioInput>({
    fecha_envio: envio ? envio.fecha_envio.slice(0, 10) : hoyColombia(),
    transportadora: envio?.transportadora ?? "",
    numero_guia: envio?.numero_guia ?? "",
    valor_envio: envio?.valor_envio !== null && envio?.valor_envio !== undefined ? String(envio.valor_envio) : "",
    iccs: envio ? envio.iccs.join("\n") : "",
  });
  const [plan, setPlan] = useState<PlanClienteInput>({
    plan_unidad: "Gigas",
    plan_cantidad: "",
    tipo_plan: "Prepago",
    duracion_meses: "12",
    pago_momento: "Anticipado",
    precio_cliente: "",
    comercial_id: comerciales.some((u) => u.id === pedido.created_by) ? pedido.created_by : "",
    estado_inicial: "Inactiva",
  });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const iccsNuevos = form.iccs.split(/[\s,;]+/).filter(Boolean).filter((i) => !(envio?.iccs ?? []).includes(i)).length;
  const cantidadIccs = form.iccs.split(/[\s,;]+/).filter(Boolean).length;
  const yaDespachadas = (pedido.envios ?? []).filter((e) => e.id !== envio?.id).reduce((acc, e) => acc + e.iccs.length, 0);

  function patch(p: Partial<EnvioInput>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  function guardar() {
    setError(null);
    startTransition(async () => {
      let comprobanteUrl: string | null = null;

      if (archivo) {
        const formData = new FormData();
        formData.append("file", archivo);
        const subida = await subirComprobante(pedido.id, formData);
        if (subida.error) { setError(traducirError(subida.error)); return; }
        comprobanteUrl = subida.url ?? null;
      }

      const datos: EnvioInput = { ...form, plan: iccsNuevos > 0 ? plan : undefined };
      const res = envio ? await actualizarEnvio(envio.id, datos, comprobanteUrl) : await registrarEnvio(pedido.id, datos, comprobanteUrl);
      if (res?.error) { setError(traducirError(res.error)); return; }
      if (!res.envio) return;

      const otros = (pedido.envios ?? []).filter((e) => e.id !== res.envio!.id);
      const patchPedido = "pedidoPatch" in res && res.pedidoPatch ? res.pedidoPatch : {};
      onGuardado({ ...pedido, ...patchPedido, envios: [...otros, res.envio] });
    });
  }

  const labelStyle = { color: "var(--text-secondary)" };
  return (
    <tr className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <td colSpan={9} className="px-6 py-4" style={{ background: "var(--bg)" }}>
        <p className="text-sm font-medium mb-3">
          {envio ? "Editar guía" : pedido.estado === "Pendiente" ? "Marcar como enviado" : "Agregar otra guía a este pedido"}
        </p>
        <div className="flex flex-wrap items-start gap-4">
          <div>
            <label className="text-xs font-medium block mb-1" style={labelStyle}>Fecha de envío</label>
            <input type="date" className="input" style={{ width: "auto" }} value={form.fecha_envio} onChange={(e) => patch({ fecha_envio: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={labelStyle}>Transportadora</label>
            <input className="input" style={{ width: "11rem" }} placeholder="Ej. Servientrega" value={form.transportadora} onChange={(e) => patch({ transportadora: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={labelStyle}>Número de guía</label>
            <input className="input" style={{ width: "11rem" }} value={form.numero_guia} onChange={(e) => patch({ numero_guia: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={labelStyle}>Valor pagado (COP)</label>
            <input className="input" style={{ width: "9rem" }} inputMode="numeric" placeholder="Ej. 15000" value={form.valor_envio} onChange={(e) => patch({ valor_envio: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={labelStyle}>Guía o comprobante (opcional — imagen o PDF)</label>
            <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="text-sm" />
          </div>
        </div>
        <div className="mt-3" style={{ maxWidth: "36rem" }}>
          <label className="text-xs font-medium block mb-1" style={labelStyle}>
            ICC de las SIM en este envío (opcional — uno por línea, o pega la lista)
          </label>
          <textarea className="input" rows={3} value={form.iccs} onChange={(e) => patch({ iccs: e.target.value })} />
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            {cantidadIccs} en este envío · {yaDespachadas + cantidadIccs} de {pedido.cantidad} pedidas
            {yaDespachadas + cantidadIccs > pedido.cantidad && " — hay más SIM que las pedidas, revisa la lista"}
          </p>
          {envio && envio.iccs.length > 0 && (
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Las SIM que ya estaban en este envío quedaron asignadas al cliente y no se pueden quitar aquí; puedes agregar más.
            </p>
          )}
        </div>
        {iccsNuevos > 0 && (
          <div className="mt-4 rounded-lg border p-4" style={{ borderColor: "var(--border)", maxWidth: "46rem" }}>
            <p className="text-sm font-medium">Plan del cliente</p>
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              Las {iccsNuevos} SIM nuevas se crean en el inventario (proveedor {pedido.proveedor}) y quedan asignadas a {pedido.cliente_nombre} con este plan.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={labelStyle}>Cantidad del plan</label>
                <div className="flex gap-2">
                  <input className="input" style={{ width: "6rem" }} inputMode="decimal" value={plan.plan_cantidad} onChange={(e) => setPlan({ ...plan, plan_cantidad: e.target.value })} />
                  <select className="input" style={{ width: "6.5rem" }} value={plan.plan_unidad} onChange={(e) => setPlan({ ...plan, plan_unidad: e.target.value })}>
                    <option>Gigas</option>
                    <option>Megas</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={labelStyle}>Tipo de plan</label>
                <select className="input" style={{ width: "8rem" }} value={plan.tipo_plan} onChange={(e) => setPlan({ ...plan, tipo_plan: e.target.value })}>
                  <option>Prepago</option>
                  <option>Postpago</option>
                </select>
              </div>
              {plan.tipo_plan === "Prepago" && (
                <div>
                  <label className="text-xs font-medium block mb-1" style={labelStyle}>Duración</label>
                  <select className="input" style={{ width: "8rem" }} value={plan.duracion_meses} onChange={(e) => setPlan({ ...plan, duracion_meses: e.target.value })}>
                    <option value="6">6 meses</option>
                    <option value="12">12 meses</option>
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs font-medium block mb-1" style={labelStyle}>Pago</label>
                <select className="input" style={{ width: "9rem" }} value={plan.pago_momento} onChange={(e) => setPlan({ ...plan, pago_momento: e.target.value })}>
                  <option>Anticipado</option>
                  <option>Mes vencido</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={labelStyle}>Precio por SIM (COP)</label>
                <input className="input" style={{ width: "9rem" }} inputMode="numeric" value={plan.precio_cliente} onChange={(e) => setPlan({ ...plan, precio_cliente: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={labelStyle}>Comercial</label>
                <select className="input" style={{ width: "12rem" }} value={plan.comercial_id} onChange={(e) => setPlan({ ...plan, comercial_id: e.target.value })}>
                  <option value="">Selecciona…</option>
                  {comerciales.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name ?? u.name ?? u.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={labelStyle}>Estado inicial</label>
                <select className="input" style={{ width: "11rem" }} value={plan.estado_inicial} onChange={(e) => setPlan({ ...plan, estado_inicial: e.target.value })}>
                  {ESTADOS_SIM.map((e) => (
                    <option key={e}>{e}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
        <div className="flex gap-3 mt-3">
          <button onClick={guardar} disabled={isPending} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 hover:underline cursor-pointer" style={{ background: "var(--state-activa)" }}>
            {isPending ? "Guardando…" : envio ? "Guardar guía" : pedido.estado === "Pendiente" ? "Confirmar envío" : "Agregar guía"}
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
      if (res?.error) { setError(traducirError(res.error)); return; }
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
