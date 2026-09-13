"use client";

import { useState, useTransition } from "react";
import { Provider } from "@/lib/types";
import { crearProveedor, actualizarProveedor, eliminarProveedor } from "./actions";
import { guardarIntegracion, probarConexion, sincronizarProveedor } from "./integration-actions";
import { ADAPTER_OPTIONS } from "@/lib/integrations/registry";

export default function ProveedoresManager({ proveedores }: { proveedores: Provider[] }) {
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await crearProveedor(nombre);
      if (res?.error) setError(res.error);
      else setNombre("");
    });
  }

  return (
    <div className="flex flex-col gap-8 max-w-xl">
      <section className="rounded-xl border bg-white p-6" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-display text-base font-semibold mb-4">Agregar proveedor</h2>
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            className="input"
            placeholder="Nombre del proveedor"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--ink-900)" }}
          >
            {isPending ? "Agregando…" : "Agregar"}
          </button>
        </form>
        {error && <p className="text-sm mt-3" style={{ color: "var(--state-desactivada)" }}>{error}</p>}
        <style jsx global>{`.input { width: 100%; border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.55rem 0.75rem; font-size: 0.875rem; }`}</style>
      </section>

      <section className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-display text-base font-semibold px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          Proveedores
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Nombre</th>
              <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Estado</th>
              <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Integración API</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {proveedores.map((p) => <ProveedorRow key={p.id} proveedor={p} />)}
          </tbody>
        </table>
        {proveedores.length === 0 && (
          <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>Aún no hay proveedores.</div>
        )}
      </section>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Desactivar un proveedor lo oculta de los formularios nuevos, pero no afecta las SIM ya
        registradas con ese proveedor. Eliminarlo lo borra de la lista de opciones — tampoco
        afecta el historial de SIMs ya creadas.
      </p>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        La integración API permite traer el estado de las SIM directamente desde la plataforma
        del proveedor. Hoy solo existe un conector de demostración — cuando tengas las
        credenciales reales de un proveedor, se implementa su conector siguiendo el mismo patrón
        (ver <code>lib/integrations</code> en el código).
      </p>
    </div>
  );
}

function ProveedorRow({ proveedor }: { proveedor: Provider }) {
  const [active, setActive] = useState(proveedor.active);
  const [removed, setRemoved] = useState(false);
  const [expandido, setExpandido] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !active;
    setActive(next);
    startTransition(() => { void actualizarProveedor(proveedor.id, { active: next }); });
  }

  function remove() {
    if (!confirm(`¿Eliminar "${proveedor.name}" de la lista de proveedores?`)) return;
    setRemoved(true);
    startTransition(() => { void eliminarProveedor(proveedor.id); });
  }

  if (removed) return null;

  return (
    <>
      <tr className="border-b" style={{ borderColor: "var(--border)" }}>
        <td className="px-6 py-3">{proveedor.name}</td>
        <td className="px-6 py-3">
          <button
            onClick={toggle}
            disabled={isPending}
            className="status-pill"
            style={{ background: active ? "#E7F5EC" : "#EEF0F4", color: active ? "var(--state-activa)" : "var(--text-muted)" }}
          >
            {active ? "Activo" : "Inactivo"}
          </button>
        </td>
        <td className="px-6 py-3">
          {proveedor.api_enabled ? (
            <span className="status-pill" style={{ background: "#E7F5EC", color: "var(--state-activa)" }}>Conectada</span>
          ) : (
            <span className="status-pill" style={{ background: "#EEF0F4", color: "var(--text-muted)" }}>Sin conectar</span>
          )}
          {proveedor.last_synced_at && (
            <span className="block text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Últ. sync: {new Date(proveedor.last_synced_at).toLocaleString("es-CO")}
            </span>
          )}
        </td>
        <td className="px-6 py-3 text-right whitespace-nowrap">
          <button onClick={() => setExpandido(!expandido)} className="text-sm mr-4" style={{ color: "var(--text-secondary)" }}>
            {expandido ? "Ocultar" : "Configurar API"}
          </button>
          <button onClick={remove} disabled={isPending} className="text-sm" style={{ color: "var(--state-desactivada)" }}>
            Eliminar
          </button>
        </td>
      </tr>
      {expandido && (
        <tr className="border-b" style={{ borderColor: "var(--border)" }}>
          <td colSpan={4} className="px-6 py-4" style={{ background: "var(--bg)" }}>
            <IntegracionPanel proveedor={proveedor} />
          </td>
        </tr>
      )}
    </>
  );
}

function IntegracionPanel({ proveedor }: { proveedor: Provider }) {
  const [slug, setSlug] = useState(proveedor.integration_slug ?? "");
  const [enabled, setEnabled] = useState(proveedor.api_enabled);
  const [baseUrl, setBaseUrl] = useState(proveedor.api_base_url ?? "");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function guardar() {
    setFeedback(null);
    startTransition(async () => {
      const res = await guardarIntegracion(proveedor.id, {
        integration_slug: slug,
        api_enabled: enabled,
        api_base_url: baseUrl,
        api_key: apiKey,
        api_secret: apiSecret,
      });
      setFeedback(res?.error ? { type: "error", text: res.error } : { type: "ok", text: "Configuración guardada." });
    });
  }

  function probar() {
    setFeedback(null);
    startTransition(async () => {
      const res = await probarConexion(proveedor.id);
      setFeedback(res?.error ? { type: "error", text: res.error } : { type: "ok", text: res.message ?? "Conexión exitosa." });
    });
  }

  function sincronizar() {
    setFeedback(null);
    startTransition(async () => {
      const res = await sincronizarProveedor(proveedor.id);
      setFeedback(res?.error ? { type: "error", text: res.error } : { type: "ok", text: res.message ?? "Sincronización completada." });
    });
  }

  return (
    <div className="max-w-xl">
      <div className="grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div className="field">
          <label className="field-label">Conector</label>
          <select className="input" value={slug} onChange={(e) => setSlug(e.target.value)}>
            <option value="">Sin conector asignado</option>
            {ADAPTER_OPTIONS.map((a) => <option key={a.slug} value={a.slug}>{a.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field-label">URL base de la API</label>
          <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.proveedor.com" />
        </div>
        <div className="field">
          <label className="field-label">API key</label>
          <input className="input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Déjalo vacío para no cambiarla" />
        </div>
        <div className="field">
          <label className="field-label">API secret (si aplica)</label>
          <input className="input" type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} placeholder="Déjalo vacío para no cambiarla" />
        </div>
      </div>

      <label className="flex items-center gap-2 mt-3 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Habilitar esta integración
      </label>

      {feedback && (
        <p className="text-sm mt-3" style={{ color: feedback.type === "error" ? "var(--state-desactivada)" : "var(--state-activa)" }}>
          {feedback.text}
        </p>
      )}

      {proveedor.last_sync_message && !feedback && (
        <p className="text-sm mt-3" style={{ color: "var(--text-secondary)" }}>Último resultado: {proveedor.last_sync_message}</p>
      )}

      <div className="flex gap-3 mt-4">
        <button onClick={guardar} disabled={isPending} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: "var(--ink-900)" }}>
          Guardar configuración
        </button>
        <button onClick={probar} disabled={isPending} className="rounded-lg border px-4 py-2 text-sm font-medium bg-white" style={{ borderColor: "var(--border)" }}>
          Probar conexión
        </button>
        <button onClick={sincronizar} disabled={isPending} className="rounded-lg border px-4 py-2 text-sm font-medium bg-white" style={{ borderColor: "var(--border)" }}>
          Sincronizar ahora
        </button>
      </div>
      <style jsx global>{`.input { width: 100%; border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.55rem 0.75rem; font-size: 0.875rem; } .field-label { font-size: 0.75rem; color: var(--text-secondary); display:block; margin-bottom:4px; }`}</style>
    </div>
  );
}
