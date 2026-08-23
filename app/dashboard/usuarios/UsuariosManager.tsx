"use client";

import { useState, useTransition } from "react";
import { Profile, RoleRow } from "@/lib/types";
import { crearUsuario, actualizarUsuario, restablecerPassword, eliminarUsuario } from "./actions";
import { MODULOS, ModuloKey } from "@/lib/modules";

export default function UsuariosManager({ usuarios, roles }: { usuarios: Profile[]; roles: RoleRow[] }) {
  return (
    <div className="flex flex-col gap-8">
      <CrearUsuarioForm roles={roles} />
      <ListaUsuarios usuarios={usuarios} roles={roles} />
    </div>
  );
}

function CrearUsuarioForm({ roles }: { roles: RoleRow[] }) {
  const primerRolNoSistema = roles.find((r) => !r.is_system) ?? roles[0];
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState(primerRolNoSistema?.id ?? "");
  const [modulos, setModulos] = useState<ModuloKey[]>((primerRolNoSistema?.default_modulos ?? []) as ModuloKey[]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const rolSeleccionado = roles.find((r) => r.id === roleId);

  function handleRoleChange(nuevoRoleId: string) {
    setRoleId(nuevoRoleId);
    const rol = roles.find((r) => r.id === nuevoRoleId);
    setModulos((rol?.default_modulos ?? []) as ModuloKey[]); // sugerencia inicial; se puede ajustar antes de crear
  }

  function toggleModulo(key: ModuloKey) {
    setModulos((prev) => (prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const res = await crearUsuario({ full_name: fullName, email, password, role_id: roleId, modulos });
      if (res?.error) setError(res.error);
      else {
        setSuccess(true);
        setFullName("");
        setEmail("");
        setPassword("");
        if (primerRolNoSistema) {
          setRoleId(primerRolNoSistema.id);
          setModulos((primerRolNoSistema.default_modulos ?? []) as ModuloKey[]);
        }
      }
    });
  }

  return (
    <section className="rounded-xl border bg-white p-6" style={{ borderColor: "var(--border)" }}>
      <h2 className="font-display text-base font-semibold mb-4">Crear usuario</h2>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 max-w-xl">
        <input className="input col-span-2" placeholder="Nombre completo" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <input className="input" type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="Contraseña (mín. 8 caracteres)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        <select className="input col-span-2" value={roleId} onChange={(e) => handleRoleChange(e.target.value)} required>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>

        {rolSeleccionado && !rolSeleccionado.is_system && (
          <div className="col-span-2">
            <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Módulos a los que tendrá acceso
            </p>
            <div className="flex flex-wrap gap-4">
              {MODULOS.map((m) => (
                <label key={m.key} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={modulos.includes(m.key)} onChange={() => toggleModulo(m.key)} />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
        )}
        {rolSeleccionado?.is_system && (
          <p className="col-span-2 text-xs" style={{ color: "var(--text-muted)" }}>
            Este rol siempre tiene acceso a todos los módulos, incluyendo Configuración.
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg py-2 text-sm font-semibold text-white px-4 self-start col-span-2"
          style={{ background: "var(--ink-900)", width: "fit-content" }}
        >
          {isPending ? "Creando…" : "Crear usuario"}
        </button>
      </form>
      {error && <p className="text-sm mt-3" style={{ color: "var(--state-desactivada)" }}>{error}</p>}
      {success && <p className="text-sm mt-3" style={{ color: "var(--state-activa)" }}>Usuario creado correctamente.</p>}
      <style jsx global>{`.input { width: 100%; border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.55rem 0.75rem; font-size: 0.875rem; }`}</style>
    </section>
  );
}

function ListaUsuarios({ usuarios, roles }: { usuarios: Profile[]; roles: RoleRow[] }) {
  return (
    <section className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "var(--border)" }}>
      <h2 className="font-display text-base font-semibold px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
        Usuarios
      </h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
            <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Nombre</th>
            <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Rol</th>
            <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Estado</th>
            <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Módulos / Acciones</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <UsuarioRow key={u.id} usuario={u} roles={roles} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function UsuarioRow({ usuario, roles }: { usuario: Profile; roles: RoleRow[] }) {
  const [roleId, setRoleId] = useState(usuario.role_id);
  const [active, setActive] = useState(usuario.active);
  const [fullName, setFullName] = useState(usuario.full_name);
  const [editing, setEditing] = useState(false);
  const [modulosAbierto, setModulosAbierto] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const rolActual = roles.find((r) => r.id === roleId);

  function handleRoleChange(newRoleId: string) {
    setRoleId(newRoleId);
    startTransition(() => {
      void actualizarUsuario(usuario.id, { role_id: newRoleId });
    });
  }

  function handleToggleActive() {
    const next = !active;
    setActive(next);
    startTransition(() => {
      void actualizarUsuario(usuario.id, { active: next });
    });
  }

  function saveName() {
    startTransition(async () => {
      const res = await actualizarUsuario(usuario.id, { full_name: fullName });
      if (res?.error) setFeedback({ type: "error", text: res.error });
      else { setFeedback(null); setEditing(false); }
    });
  }

  function handleResetPassword() {
    const nueva = prompt(`Nueva contraseña para ${usuario.full_name} (mínimo 8 caracteres):`);
    if (!nueva) return;
    startTransition(async () => {
      const res = await restablecerPassword(usuario.id, nueva);
      setFeedback(res?.error ? { type: "error", text: res.error } : { type: "ok", text: "Contraseña actualizada." });
    });
  }

  function handleDelete() {
    if (!confirm(`¿Eliminar a "${usuario.full_name}"? Esta acción no se puede deshacer.`)) return;
    startTransition(async () => {
      const res = await eliminarUsuario(usuario.id);
      if (res?.error) setFeedback({ type: "error", text: res.error });
      else setRemoved(true);
    });
  }

  if (removed) return null;

  return (
    <>
    <tr className="border-b last:border-0 align-top" style={{ borderColor: "var(--border)" }}>
      <td className="px-6 py-3">
        {editing ? (
          <div className="flex gap-2 items-center">
            <input
              className="input"
              style={{ maxWidth: "12rem" }}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoFocus
            />
            <button onClick={saveName} disabled={isPending} className="text-xs font-medium hover:underline cursor-pointer" style={{ color: "var(--state-activa)" }}>Guardar</button>
            <button onClick={() => { setEditing(false); setFullName(usuario.full_name); }} className="text-xs hover:underline cursor-pointer" style={{ color: "var(--text-muted)" }}>Cancelar</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span>{fullName}</span>
            <button onClick={() => setEditing(true)} className="text-xs hover:underline cursor-pointer" style={{ color: "var(--text-secondary)" }}>Editar</button>
          </div>
        )}
        {feedback && (
          <p className="text-xs mt-1" style={{ color: feedback.type === "error" ? "var(--state-desactivada)" : "var(--state-activa)" }}>
            {feedback.text}
          </p>
        )}
      </td>
      <td className="px-6 py-3">
        <select
          className="input"
          style={{ maxWidth: "12rem" }}
          value={roleId}
          disabled={isPending}
          onChange={(e) => handleRoleChange(e.target.value)}
        >
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </td>
      <td className="px-6 py-3">
        <button
          onClick={handleToggleActive}
          disabled={isPending}
          className="status-pill"
          style={{
            background: active ? "#E7F5EC" : "#EEF0F4",
            color: active ? "var(--state-activa)" : "var(--text-muted)",
          }}
        >
          {active ? "Activo" : "Inactivo"}
        </button>
      </td>
      <td className="px-6 py-3">
        <div className="flex flex-col gap-1.5 items-start">
          <button onClick={() => setModulosAbierto(!modulosAbierto)} disabled={isPending} className="text-xs font-medium hover:underline cursor-pointer" style={{ color: "var(--text-secondary)" }}>
            {rolActual?.is_system ? "Acceso total" : `${modulosAbierto ? "Ocultar" : "Editar"} módulos`}
          </button>
          <button onClick={handleResetPassword} disabled={isPending} className="text-xs font-medium hover:underline cursor-pointer" style={{ color: "var(--text-secondary)" }}>
            Restablecer contraseña
          </button>
          <button onClick={handleDelete} disabled={isPending} className="text-xs font-medium hover:underline cursor-pointer" style={{ color: "var(--state-desactivada)" }}>
            Eliminar usuario
          </button>
        </div>
      </td>
    </tr>
    {modulosAbierto && !rolActual?.is_system && (
      <tr className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
        <td colSpan={4} className="px-6 py-4" style={{ background: "var(--bg)" }}>
          <ModulosUsuarioPanel usuarioId={usuario.id} modulosActuales={usuario.modulos} onFeedback={setFeedback} />
        </td>
      </tr>
    )}
    </>
  );
}

function ModulosUsuarioPanel({
  usuarioId,
  modulosActuales,
  onFeedback,
}: {
  usuarioId: string;
  modulosActuales: string[];
  onFeedback: (f: { type: "ok" | "error"; text: string }) => void;
}) {
  const [modulos, setModulos] = useState<ModuloKey[]>((modulosActuales ?? []) as ModuloKey[]);
  const [isPending, startTransition] = useTransition();

  function toggle(key: ModuloKey) {
    setModulos((prev) => (prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]));
  }

  function guardar() {
    startTransition(async () => {
      const res = await actualizarUsuario(usuarioId, { modulos });
      onFeedback(res?.error ? { type: "error", text: res.error } : { type: "ok", text: "Módulos actualizados." });
    });
  }

  return (
    <div className="max-w-lg">
      <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Módulos a los que tiene acceso</p>
      <div className="flex flex-wrap gap-4 mb-3">
        {MODULOS.map((m) => (
          <label key={m.key} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={modulos.includes(m.key)} onChange={() => toggle(m.key)} />
            {m.label}
          </label>
        ))}
      </div>
      <button onClick={guardar} disabled={isPending} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: "var(--ink-900)" }}>
        {isPending ? "Guardando…" : "Guardar módulos"}
      </button>
    </div>
  );
}
