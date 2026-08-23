"use client";

import { useState, useTransition } from "react";
import { RoleRow } from "@/lib/types";
import { MODULOS, ModuloKey } from "@/lib/modules";
import { crearRol, actualizarRol, eliminarRol } from "./actions";

export default function RolesManager({ roles }: { roles: RoleRow[] }) {
  const [nombre, setNombre] = useState("");
  const [modulos, setModulos] = useState<ModuloKey[]>(["inventario", "alertas"]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleModulo(key: ModuloKey) {
    setModulos((prev) => (prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await crearRol({ name: nombre, default_modulos: modulos });
      if (res?.error) setError(res.error);
      else { setNombre(""); setModulos(["inventario", "alertas"]); }
    });
  }

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <section className="rounded-xl border bg-white p-6" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-display text-base font-semibold mb-4">Crear rol</h2>
        <form onSubmit={handleSubmit}>
          <input
            className="input mb-3"
            placeholder="Nombre del rol (ej: Auditor, Soporte, Distribuidor…)"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
          <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Módulos que sugerir por defecto para este rol (se puede ajustar por usuario después)
          </p>
          <div className="flex flex-wrap gap-4 mb-4">
            {MODULOS.map((m) => (
              <label key={m.key} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={modulos.includes(m.key)} onChange={() => toggleModulo(m.key)} />
                {m.label}
              </label>
            ))}
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--ink-900)" }}
          >
            {isPending ? "Creando…" : "Crear rol"}
          </button>
        </form>
        {error && <p className="text-sm mt-3" style={{ color: "var(--state-desactivada)" }}>{error}</p>}
        <style jsx global>{`.input { width: 100%; border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.55rem 0.75rem; font-size: 0.875rem; }`}</style>
      </section>

      <section className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-display text-base font-semibold px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          Roles
        </h2>
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {roles.map((r) => <RolRow key={r.id} rol={r} />)}
        </div>
      </section>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        El rol del super administrador está protegido: no se puede renombrar ni eliminar, porque
        la plataforma siempre necesita a alguien con acceso total. El resto de roles son
        completamente libres — puedes renombrarlos, ajustarlos o eliminarlos cuando quieras (si
        tienen usuarios asignados, primero cámbialos de rol).
      </p>
    </div>
  );
}

function RolRow({ rol }: { rol: RoleRow }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(rol.name);
  const [modulos, setModulos] = useState<ModuloKey[]>((rol.default_modulos ?? []) as ModuloKey[]);
  const [removido, setRemovido] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleModulo(key: ModuloKey) {
    const next = modulos.includes(key) ? modulos.filter((m) => m !== key) : [...modulos, key];
    setModulos(next);
    startTransition(() => { void actualizarRol(rol.id, { default_modulos: next }); });
  }

  function guardarNombre() {
    startTransition(async () => {
      const res = await actualizarRol(rol.id, { name: nombre });
      if (res?.error) setError(res.error);
      else { setError(null); setEditando(false); }
    });
  }

  function eliminar() {
    if (!confirm(`¿Eliminar el rol "${rol.name}"?`)) return;
    startTransition(async () => {
      const res = await eliminarRol(rol.id);
      if (res?.error) setError(res.error);
      else setRemovido(true);
    });
  }

  if (removido) return null;

  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {editando ? (
            <>
              <input
                className="rounded-lg border px-2 py-1 text-sm"
                style={{ borderColor: "var(--border)", maxWidth: "14rem" }}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                autoFocus
              />
              <button onClick={guardarNombre} disabled={isPending} className="text-xs font-medium" style={{ color: "var(--state-activa)" }}>Guardar</button>
              <button onClick={() => { setEditando(false); setNombre(rol.name); }} className="text-xs" style={{ color: "var(--text-muted)" }}>Cancelar</button>
            </>
          ) : (
            <>
              <span className="font-medium text-sm">{rol.name}</span>
              {rol.is_system ? (
                <span className="status-pill" style={{ background: "var(--chip-gold-soft)", color: "var(--chip-gold)" }}>
                  Rol del sistema — protegido
                </span>
              ) : (
                <button onClick={() => setEditando(true)} className="text-xs" style={{ color: "var(--text-secondary)" }}>Editar nombre</button>
              )}
            </>
          )}
        </div>
        {!rol.is_system && (
          <button onClick={eliminar} disabled={isPending} className="text-sm" style={{ color: "var(--state-desactivada)" }}>
            Eliminar
          </button>
        )}
      </div>

      {rol.is_system ? (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Siempre tiene acceso a todos los módulos, incluyendo Configuración.</p>
      ) : (
        <div className="flex flex-wrap gap-4">
          {MODULOS.map((m) => (
            <label key={m.key} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={modulos.includes(m.key)} disabled={isPending} onChange={() => toggleModulo(m.key)} />
              {m.label}
            </label>
          ))}
        </div>
      )}
      {error && <p className="text-sm mt-2" style={{ color: "var(--state-desactivada)" }}>{error}</p>}
    </div>
  );
}
