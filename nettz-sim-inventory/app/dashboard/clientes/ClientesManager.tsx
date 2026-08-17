"use client";

import { useState, useTransition } from "react";
import { Cliente } from "@/lib/types";
import { crearCliente, actualizarCliente, eliminarCliente, ClienteInput } from "./actions";

const CAMPOS_VACIOS: ClienteInput = { nombre: "", documento: "", telefono: "", correo: "", direccion: "", observaciones: "" };

export default function ClientesManager({ clientes }: { clientes: Cliente[] }) {
  const [busqueda, setBusqueda] = useState("");
  const filtrados = clientes.filter((c) => c.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  return (
    <div className="flex flex-col gap-8">
      <CrearClienteForm />

      <section className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-display text-base font-semibold">Clientes</h2>
          <input
            className="input"
            style={{ maxWidth: "16rem" }}
            placeholder="Buscar por nombre…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Nombre</th>
              <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Documento</th>
              <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Contacto</th>
              <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Estado</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => <ClienteRow key={c.id} cliente={c} />)}
          </tbody>
        </table>
        {filtrados.length === 0 && (
          <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            {busqueda ? "Ningún cliente coincide con la búsqueda." : "Aún no hay clientes registrados."}
          </div>
        )}
      </section>
      <style jsx global>{`.input { width: 100%; border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.55rem 0.75rem; font-size: 0.875rem; }`}</style>
    </div>
  );
}

function CrearClienteForm() {
  const [form, setForm] = useState<ClienteInput>(CAMPOS_VACIOS);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function patch(p: Partial<ClienteInput>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const res = await crearCliente(form);
      if (res?.error) setError(res.error);
      else { setSuccess(true); setForm(CAMPOS_VACIOS); }
    });
  }

  return (
    <section className="rounded-xl border bg-white p-6" style={{ borderColor: "var(--border)" }}>
      <h2 className="font-display text-base font-semibold mb-4">Registrar cliente</h2>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 max-w-2xl">
        <input className="input col-span-2" placeholder="Nombre completo o razón social *" value={form.nombre} onChange={(e) => patch({ nombre: e.target.value })} required />
        <input className="input" placeholder="Documento / NIT (opcional)" value={form.documento} onChange={(e) => patch({ documento: e.target.value })} />
        <input className="input" placeholder="Teléfono (opcional)" value={form.telefono} onChange={(e) => patch({ telefono: e.target.value })} />
        <input className="input" type="email" placeholder="Correo (opcional)" value={form.correo} onChange={(e) => patch({ correo: e.target.value })} />
        <input className="input" placeholder="Dirección (opcional)" value={form.direccion} onChange={(e) => patch({ direccion: e.target.value })} />
        <textarea className="input col-span-2" rows={2} placeholder="Observaciones (opcional)" value={form.observaciones} onChange={(e) => patch({ observaciones: e.target.value })} />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg py-2 text-sm font-semibold text-white px-4 self-start col-span-2"
          style={{ background: "var(--ink-900)", width: "fit-content" }}
        >
          {isPending ? "Guardando…" : "Registrar cliente"}
        </button>
      </form>
      {error && <p className="text-sm mt-3" style={{ color: "var(--state-desactivada)" }}>{error}</p>}
      {success && <p className="text-sm mt-3" style={{ color: "var(--state-activa)" }}>Cliente registrado correctamente.</p>}
    </section>
  );
}

function ClienteRow({ cliente }: { cliente: Cliente }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(cliente.nombre);
  const [active, setActive] = useState(cliente.active);
  const [removido, setRemovido] = useState(false);
  const [isPending, startTransition] = useTransition();

  function guardarNombre() {
    startTransition(async () => {
      const res = await actualizarCliente(cliente.id, { nombre });
      if (!res?.error) setEditando(false);
    });
  }

  function toggleActivo() {
    const next = !active;
    setActive(next);
    startTransition(() => { void actualizarCliente(cliente.id, { active: next }); });
  }

  function eliminar() {
    if (!confirm(`¿Eliminar a "${cliente.nombre}"? Esto no afecta el historial de SIM ya asignadas a este nombre.`)) return;
    setRemovido(true);
    startTransition(() => { void eliminarCliente(cliente.id); });
  }

  if (removido) return null;

  return (
    <tr className="border-b last:border-0 align-top" style={{ borderColor: "var(--border)" }}>
      <td className="px-6 py-3">
        {editando ? (
          <div className="flex gap-2 items-center">
            <input className="input" style={{ maxWidth: "12rem" }} value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
            <button onClick={guardarNombre} disabled={isPending} className="text-xs font-medium" style={{ color: "var(--state-activa)" }}>Guardar</button>
            <button onClick={() => { setEditando(false); setNombre(cliente.nombre); }} className="text-xs" style={{ color: "var(--text-muted)" }}>Cancelar</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span>{nombre}</span>
            <button onClick={() => setEditando(true)} className="text-xs" style={{ color: "var(--text-secondary)" }}>Editar</button>
          </div>
        )}
      </td>
      <td className="px-6 py-3">{cliente.documento ?? "—"}</td>
      <td className="px-6 py-3">
        <div>{cliente.telefono ?? "—"}</div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{cliente.correo ?? ""}</div>
      </td>
      <td className="px-6 py-3">
        <button
          onClick={toggleActivo}
          disabled={isPending}
          className="status-pill"
          style={{ background: active ? "#E7F5EC" : "#EEF0F4", color: active ? "var(--state-activa)" : "var(--text-muted)" }}
        >
          {active ? "Activo" : "Inactivo"}
        </button>
      </td>
      <td className="px-6 py-3 text-right">
        <button onClick={eliminar} disabled={isPending} className="text-sm" style={{ color: "var(--state-desactivada)" }}>
          Eliminar
        </button>
      </td>
    </tr>
  );
}
