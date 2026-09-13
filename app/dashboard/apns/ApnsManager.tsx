"use client";

import { useState, useTransition } from "react";
import { Apn } from "@/lib/types";
import { crearApn, actualizarApn, eliminarApn } from "./actions";

export default function ApnsManager({ apns }: { apns: Apn[] }) {
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await crearApn(nombre);
      if (res?.error) setError(res.error);
      else setNombre("");
    });
  }

  return (
    <div className="flex flex-col gap-8 max-w-xl">
      <section className="rounded-xl border bg-white p-6" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-display text-base font-semibold mb-4">Agregar APN</h2>
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            className="input font-mono"
            placeholder="Ej: internet.claro.com.co"
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
          APN
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Nombre</th>
              <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Estado</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {apns.map((a) => <ApnRow key={a.id} apn={a} />)}
          </tbody>
        </table>
        {apns.length === 0 && (
          <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>Aún no hay APN configurados.</div>
        )}
      </section>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Desactivar un APN lo oculta de los formularios nuevos, pero no afecta las SIM que ya lo
        tienen asignado. Eliminarlo lo borra de la lista de opciones — tampoco afecta el historial.
      </p>
    </div>
  );
}

function ApnRow({ apn }: { apn: Apn }) {
  const [active, setActive] = useState(apn.active);
  const [removed, setRemoved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !active;
    setActive(next);
    startTransition(() => { void actualizarApn(apn.id, { active: next }); });
  }

  function remove() {
    if (!confirm(`¿Eliminar "${apn.name}" de la lista de APN?`)) return;
    setRemoved(true);
    startTransition(() => { void eliminarApn(apn.id); });
  }

  if (removed) return null;

  return (
    <tr className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <td className="px-6 py-3 font-mono">{apn.name}</td>
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
      <td className="px-6 py-3 text-right">
        <button onClick={remove} disabled={isPending} className="text-sm" style={{ color: "var(--state-desactivada)" }}>
          Eliminar
        </button>
      </td>
    </tr>
  );
}
