"use client";

import { useState, useTransition } from "react";
import { Cliente, INDUSTRIAS } from "@/lib/types";
import { formatCodigoCliente, formatFecha } from "@/lib/ui";
import { crearCliente, actualizarCliente, eliminarCliente, ClienteInput } from "./actions";
import CargaMasivaClientes from "./CargaMasivaClientes";

const CAMPOS_VACIOS: ClienteInput = {
  nombre: "",
  contacto_responsable: "",
  documento: "",
  telefono: "",
  correo: "",
  direccion: "",
  industria: "",
  fecha_vinculacion: "",
  observaciones: "",
};

export default function ClientesManager({ clientes }: { clientes: Cliente[] }) {
  const [busqueda, setBusqueda] = useState("");
  const filtrados = clientes
    .filter((c) => c.nombre.toLowerCase().includes(busqueda.toLowerCase()) || String(c.codigo).includes(busqueda))
    .sort((a, b) => a.codigo - b.codigo);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-end">
        
          href="/dashboard/clientes/exportar"
          className="rounded-lg border px-4 py-2 text-sm font-medium bg-white"
          style={{ borderColor: "var(--border)" }}
        >
          ⬇ Descargar base de clientes
        </a>
      </div>

      <CrearClienteForm />

      <CargaMasivaClientes />

      <section className="rounded-xl border bg-white overflow-x-auto" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-display text-base font-semibold">Clientes</h2>
          <input
            className="input"
            style={{ maxWidth: "16rem" }}
            placeholder="Buscar por nombre o código…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <table className="w-full text-sm" style={{ minWidth: "1100px" }}>
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Código</th>
              <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Nombre</th>
              <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Contacto responsable</th>
              <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Documento</th>
              <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Contacto</th>
              <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Industria</th>
              <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Vinculación</th>
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

function CamposCliente({ form, patch }: { form: ClienteInput; patch: (p: Partial<ClienteInput>) => void }) {
  return (
    <>
      <input className="input col-span-2" placeholder="Nombre completo o razón social *" value={form.nombre} onChange={(e) => patch({ nombre: e.target.value })} required />
      <input className="input" placeholder="Contacto responsable" value={form.contacto_responsable} onChange={(e) => patch({ contacto_responsable: e.target.value })} />
      <input className="input" placeholder="Documento / NIT" value={form.documento} onChange={(e) => patch({ documento: e.target.value })} />
      <input className="input" placeholder="Teléfono" value={form.telefono} onChange={(e) => patch({ telefono: e.target.value })} />
      <input className="input" type="email" placeholder="Correo" value={form.correo} onChange={(e) => patch({ correo: e.target.value })} />
      <input className="input" placeholder="Dirección" value={form.direccion} onChange={(e) => patch({ direccion: e.target.value })} />
      <select className="input" value={form.industria} onChange={(e) => patch({ industria: e.target.value })}>
        <option value="">Industria (sin especificar)</option>
        {INDUSTRIAS.map((i) => <option key={i} value={i}>{i}</option>)}
      </select>
      <div className="field">
        <label className="text-xs" style={{ color: "var(--text-secondary)" }}>Fecha de vinculación</label>
        <input className="input" type="date" value={form.fecha_vinculacion} onChange={(e) => patch({ fecha_vinculacion: e.target.value })} />
      </div>
      <textarea className="input col-span-2" rows={2} placeholder="Observaciones" value={form.observaciones} onChange={(e) => patch({ observaciones: e.target.value })} />
    </>
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
        <CamposCliente form={form} patch={patch} />
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

function formToCliente(cliente: Cliente): ClienteInput {
  return {
    nombre: cliente.nombre,
    contacto_responsable: cliente.contacto_responsable ?? "",
    documento: cliente.documento ?? "",
    telefono: cliente.telefono ?? "",
    correo: cliente.correo ?? "",
    direccion: cliente.direccion ?? "",
    industria: cliente.industria ?? "",
    fecha_vinculacion: cliente.fecha_vinculacion ?? "",
    observaciones: cliente.observaciones ?? "",
  };
}

function ClienteRow({ cliente }: { cliente: Cliente }) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<ClienteInput>(formToCliente(cliente));
  const [active, setActive] = useState(cliente.active);
  const [removido, setRemovido] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function patch(p: Partial<ClienteInput>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  function guardar() {
    setError(null);
    startTransition(async () => {
      const res = await actualizarCliente(cliente.id, form);
      if (res?.error) setError(res.error);
      else setEditando(false);
    });
  }

  function cancelar() {
    setForm(formToCliente(cliente));
    setError(null);
    setEditando(false);
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

  if (editando) {
    return (
      <tr className="border-b last:border-0 align-top" style={{ borderColor: "var(--border)" }}>
        <td colSpan={9} className="px-6 py-4" style={{ background: "var(--bg)" }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>{formatCodigoCliente(cliente.codigo)}</span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>(el código no se puede editar)</span>
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-2xl">
            <CamposCliente form={form} patch={patch} />
          </div>
          {error && <p className="text-sm mt-2" style={{ color: "var(--state-desactivada)" }}>{error}</p>}
          <div className="flex gap-3 mt-3">
            <button onClick={guardar} disabled={isPending} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--ink-900)" }}>
              {isPending ? "Guardando…" : "Guardar cambios"}
            </button>
            <button onClick={cancelar} disabled={isPending} className="rounded-lg border px-4 py-2 text-sm font-medium" style={{ borderColor: "var(--border)" }}>
              Cancelar
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b last:border-0 align-top" style={{ borderColor: "var(--border)" }}>
      <td className="px-6 py-3 font-mono whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{formatCodigoCliente(cliente.codigo)}</td>
      <td className="px-6 py-3">
        <div className="flex items-center gap-2">
          <span>{cliente.nombre}</span>
          <button onClick={() => setEditando(true)} className="text-xs" style={{ color: "var(--text-secondary)" }}>Editar</button>
        </div>
      </td>
      <td className="px-6 py-3 whitespace-nowrap">{cliente.contacto_responsable ?? "—"}</td>
      <td className="px-6 py-3 whitespace-nowrap">{cliente.documento ?? "—"}</td>
      <td className="px-6 py-3">
        <div>{cliente.telefono ?? "—"}</div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{cliente.correo ?? ""}</div>
      </td>
      <td className="px-6 py-3 whitespace-nowrap">{cliente.industria ?? "—"}</td>
      <td className="px-6 py-3 whitespace-nowrap">{cliente.fecha_vinculacion ? formatFecha(cliente.fecha_vinculacion) : "—"}</td>
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
