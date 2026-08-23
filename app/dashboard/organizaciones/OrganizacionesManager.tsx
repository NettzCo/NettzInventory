"use client";

import { useState, useTransition, useRef } from "react";
import { Organization } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { crearOrganizacion, actualizarOrganizacion } from "./actions";

export default function OrganizacionesManager({ organizaciones }: { organizaciones: Organization[] }) {
  return (
    <div className="flex flex-col gap-8">
      <CrearOrganizacionForm />
      <ListaOrganizaciones organizaciones={organizaciones} />
    </div>
  );
}

async function subirLogo(file: File): Promise<{ url?: string; error?: string }> {
  const supabase = createClient();
  const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "")}`;
  const { error } = await supabase.storage.from("org-logos").upload(path, file, { upsert: true });
  if (error) return { error: error.message };
  const { data } = supabase.storage.from("org-logos").getPublicUrl(path);
  return { url: data.publicUrl };
}

function CrearOrganizacionForm() {
  const [name, setName] = useState("");
  const [colorInk, setColorInk] = useState("#242307");
  const [colorAccent, setColorAccent] = useState("#a89600");
  const [logoUrl, setLogoUrl] = useState("");
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [adminFullName, setAdminFullName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendoLogo(true);
    setError(null);
    const res = await subirLogo(file);
    setSubiendoLogo(false);
    if (res.error) setError(`No se pudo subir el logo: ${res.error}`);
    else setLogoUrl(res.url!);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const res = await crearOrganizacion({ name, colorInk, colorAccent, logoUrl, adminFullName, adminEmail, adminPassword });
      if (res?.error) setError(res.error);
      else {
        setSuccess(true);
        setName(""); setLogoUrl(""); setAdminFullName(""); setAdminEmail(""); setAdminPassword("");
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  }

  return (
    <section className="rounded-xl border bg-white p-6" style={{ borderColor: "var(--border)" }}>
      <h2 className="font-display text-base font-semibold mb-1">Crear organización</h2>
      <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
        Crea un cliente nuevo con su propio logo, colores y su primer usuario (Super administrador de esa organización).
      </p>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 max-w-xl">
        <input className="input col-span-2" placeholder="Nombre de la organización" value={name} onChange={(e) => setName(e.target.value)} required />

        <div className="field">
          <label className="field-label">Color principal</label>
          <div className="flex items-center gap-2">
            <input type="color" value={colorInk} onChange={(e) => setColorInk(e.target.value)} style={{ width: 40, height: 36, padding: 0, border: "1px solid var(--border)", borderRadius: 6 }} />
            <input className="input" value={colorInk} onChange={(e) => setColorInk(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label className="field-label">Color de acento</label>
          <div className="flex items-center gap-2">
            <input type="color" value={colorAccent} onChange={(e) => setColorAccent(e.target.value)} style={{ width: 40, height: 36, padding: 0, border: "1px solid var(--border)", borderRadius: 6 }} />
            <input className="input" value={colorAccent} onChange={(e) => setColorAccent(e.target.value)} />
          </div>
        </div>

        <div className="field col-span-2">
          <label className="field-label">Logo (opcional; sobre fondo del color principal)</label>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleLogoChange} className="text-sm" />
          {subiendoLogo && <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Subiendo…</p>}
          {logoUrl && !subiendoLogo && (
            <div className="mt-2 p-3 rounded-lg inline-block" style={{ background: colorInk }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Logo" style={{ height: 28 }} />
            </div>
          )}
        </div>

        <div className="col-span-2 border-t pt-3 mt-1" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Primer usuario (Super administrador de esta organización)</p>
        </div>
        <input className="input col-span-2" placeholder="Nombre completo" value={adminFullName} onChange={(e) => setAdminFullName(e.target.value)} required />
        <input className="input" type="email" placeholder="Correo" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="Contraseña (mín. 8 caracteres)" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required minLength={8} />

        <button
          type="submit"
          disabled={isPending || subiendoLogo}
          className="rounded-lg py-2 text-sm font-semibold text-white px-4 self-start col-span-2"
          style={{ background: "var(--ink-900)", width: "fit-content" }}
        >
          {isPending ? "Creando…" : "Crear organización"}
        </button>
      </form>
      {error && <p className="text-sm mt-3" style={{ color: "var(--state-desactivada)" }}>{error}</p>}
      {success && <p className="text-sm mt-3" style={{ color: "var(--state-activa)" }}>Organización creada correctamente.</p>}
      <style jsx global>{`
        .input { width: 100%; border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.55rem 0.75rem; font-size: 0.875rem; }
        .field-label { font-size: 0.75rem; color: var(--text-secondary); display:block; margin-bottom:4px; }
      `}</style>
    </section>
  );
}

function ListaOrganizaciones({ organizaciones }: { organizaciones: Organization[] }) {
  return (
    <section className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "var(--border)" }}>
      <h2 className="font-display text-base font-semibold px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
        Organizaciones
      </h2>
      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        {organizaciones.map((o) => <OrganizacionRow key={o.id} organizacion={o} />)}
      </div>
    </section>
  );
}

function OrganizacionRow({ organizacion }: { organizacion: Organization }) {
  const [nombre, setNombre] = useState(organizacion.name);
  const [colorInk, setColorInk] = useState(organizacion.color_ink);
  const [colorAccent, setColorAccent] = useState(organizacion.color_accent);
  const [logoUrl, setLogoUrl] = useState(organizacion.logo_url ?? "");
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [editando, setEditando] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendoLogo(true);
    const res = await subirLogo(file);
    setSubiendoLogo(false);
    if (res.error) { setFeedback({ type: "error", text: res.error }); return; }
    setLogoUrl(res.url!);
    startTransition(async () => {
      const r = await actualizarOrganizacion(organizacion.id, { logo_url: res.url });
      setFeedback(r?.error ? { type: "error", text: r.error } : { type: "ok", text: "Logo actualizado." });
    });
  }

  function guardar() {
    startTransition(async () => {
      const r = await actualizarOrganizacion(organizacion.id, { name: nombre, color_ink: colorInk, color_accent: colorAccent });
      if (r?.error) setFeedback({ type: "error", text: r.error });
      else { setFeedback({ type: "ok", text: "Guardado." }); setEditando(false); }
    });
  }

  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded" style={{ background: colorInk }}>
            {logoUrl
              ? <img src={logoUrl} alt={nombre} style={{ height: 22 }} />
              : <span className="text-xs px-2" style={{ color: colorAccent }}>{nombre.slice(0, 2).toUpperCase()}</span>}
          </div>
          {editando ? (
            <input className="rounded-lg border px-2 py-1 text-sm" style={{ borderColor: "var(--border)", maxWidth: "14rem" }} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          ) : (
            <span className="font-medium text-sm">{nombre}</span>
          )}
        </div>
        {editando ? (
          <div className="flex gap-3">
            <button onClick={guardar} disabled={isPending} className="text-xs font-medium" style={{ color: "var(--state-activa)" }}>Guardar</button>
            <button onClick={() => setEditando(false)} className="text-xs" style={{ color: "var(--text-muted)" }}>Cancelar</button>
          </div>
        ) : (
          <button onClick={() => setEditando(true)} className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Editar</button>
        )}
      </div>

      {editando && (
        <div className="flex flex-wrap items-center gap-4 mb-2">
          <label className="flex items-center gap-2 text-xs">
            Principal
            <input type="color" value={colorInk} onChange={(e) => setColorInk(e.target.value)} style={{ width: 32, height: 28, padding: 0, border: "1px solid var(--border)", borderRadius: 6 }} />
          </label>
          <label className="flex items-center gap-2 text-xs">
            Acento
            <input type="color" value={colorAccent} onChange={(e) => setColorAccent(e.target.value)} style={{ width: 32, height: 28, padding: 0, border: "1px solid var(--border)", borderRadius: 6 }} />
          </label>
          <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Cambiar logo:{" "}
            <input type="file" accept="image/*" onChange={handleLogoChange} className="text-xs" style={{ display: "inline" }} />
          </label>
          {subiendoLogo && <span className="text-xs" style={{ color: "var(--text-muted)" }}>Subiendo…</span>}
        </div>
      )}
      {feedback && (
        <p className="text-xs" style={{ color: feedback.type === "error" ? "var(--state-desactivada)" : "var(--state-activa)" }}>{feedback.text}</p>
      )}
    </div>
  );
}
