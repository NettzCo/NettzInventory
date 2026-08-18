"use client";

import { useState, useTransition } from "react";
import { Pedido } from "@/lib/types";
import { formatFechaHora } from "@/lib/ui";
import { crearPedido, marcarPedidoEnviado, PedidoInput } from "./actions";

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

export default function PedidosManager({
  pedidos,
  clientes,
  proveedores,
  apns,
  usuarios,
  currentUserId,
  esSuperAdmin,
}: {
  pedidos: Pedido[];
  clientes: Opcion[];
  proveedores: Opcion[];
  apns: Opcion[];
  usuarios: Opcion[];
  currentUserId: string;
  esSuperAdmin: boolean;
}) {
  const [filtro, setFiltro] = useState<"todos" | "pendientes" | "enviados">("todos");

  const visibles = pedidos.filter((p) => {
    if (filtro === "pendientes") return p.estado === "Pendiente";
    if (filtro === "enviados") return p.estado === "Enviado";
    return true;
  });

  const nombreUsuario = new Map(usuarios.map((u) => [u.id, u.full_name ?? ""]));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-end">
        <a
          href="/dashboard/pedidos/exportar"
          className="rounded-lg border px-4 py-2 text-sm font-medium bg-white"
          style={{ borderColor: "var(--border)" }}
        >
          {"\u2B07"} Descargar pedidos
        </a>
      </div>

      <FormularioPedido clientes={clientes} proveedores={proveedores} apns={apns} usuarios={usuarios} />

      <section className="rounded-xl border bg-white overflow-x-auto" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-display text-base font-semibold">Pedidos registrados</h2>
          <div className="flex gap-2">
            {(["todos", "pendientes", "enviados"] as const).map((f) => (
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
        <table className="w-full text-sm" style={{ minWidth: "1200px" }}>
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
              <FilaPedido key={p.id} pedido={p} currentUserId={currentUserId} esSuperAdmin={esSuperAdmin} nombreAsignado={nombreUsuario.get(p.asignado_a) ?? "Usuario"} />
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

function FormularioPedido({
  clientes,
  proveedores,
  apns,
  usuarios,
}: {
  clientes: Opcion[];
  proveedores: Opcion[];
  apns: Opcion[];
  usuarios: Opcion[];
}) {
  const [form, setForm] = useState<PedidoInput>(CAMPOS_VACIOS);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function patch(p: Partial<PedidoInput>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  function handleClienteChange(id: string) {
    const cliente = clientes.find((c) => c.id === id);
    patch({ cliente_id: id, cliente_nombre: cliente?.nombre ?? "" });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const res = await crearPedido(form);
      if (res?.error) setError(res.error);
      else { setSuccess(true); setForm(CAMPOS_VACIOS); }
    });
  }

  return (
    <section className="rounded-xl border bg-white p-6" style={{ borderColor: "var(--border)" }}>
      <h2 className="font-display text-base font-semibold mb-1">Registrar pedido</h2>
      <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
        Se registra con la fecha y hora actuales automáticamente.
      </p>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 max-w-3xl">
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
}: {
  pedido: Pedido;
  currentUserId: string;
  esSuperAdmin: boolean;
  nombreAsignado: string;
}) {
  const [estado, setEstado] = useState(pedido.estado);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const puedeConfirmar = pedido.asignado_a === currentUserId || esSuperAdmin;

  function confirmarEnvio() {
    setError(null);
    startTransition(async () => {
      const res = await marcarPedidoEnviado(pedido.id);
      if (res?.error) setError(res.error);
      else setEstado("Enviado");
    });
  }

  return (
    <tr className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
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
        <span
          className="status-pill"
          style={{
            background: estado === "Enviado" ? "#E7F5EC" : "#FDF3E4",
            color: estado === "Enviado" ? "var(--state-activa)" : "var(--state-lista)",
          }}
        >
          {estado}
        </span>
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {estado === "Pendiente" && puedeConfirmar && (
          <button onClick={confirmarEnvio} disabled={isPending} className="text-sm font-medium" style={{ color: "var(--state-activa)" }}>
            {isPending ? "Guardando…" : "Marcar como enviado"}
          </button>
        )}
        {error && <p className="text-xs mt-1" style={{ color: "var(--state-desactivada)" }}>{error}</p>}
      </td>
    </tr>
  );
}
