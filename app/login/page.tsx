import LoginForm from "./LoginForm";
import { BRAND } from "@/lib/branding";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex" style={{ background: "var(--bg)" }}>
      {/* Panel izquierdo: identidad, visible desde tablet en adelante */}
      <div
        className="hidden md:flex md:w-[42%] flex-col justify-between p-12 text-white relative overflow-hidden"
        style={{ background: "var(--ink-900)" }}
      >
        {/* Franja de acento amarillo en el borde izquierdo */}
        <div className="absolute left-0 top-0 bottom-0" style={{ width: "6px", background: "var(--chip-gold)" }} />

        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND.logoFull} alt={BRAND.name} style={{ height: "56px", width: "auto" }} />
        </div>

        <div>
          {/* Motivo de la SIM horizontal, como firma visual del producto */}
          <svg width="128" height="86" viewBox="0 0 128 86" fill="none" className="mb-8 opacity-90">
            <path d="M8 0 H104 L128 20 V78 Q128 86 120 86 H8 Q0 86 0 78 V8 Q0 0 8 0 Z" stroke="var(--chip-gold)" strokeWidth="2" />
            <path d="M104 0 V14 Q104 20 110 20 H128" stroke="var(--chip-gold)" strokeWidth="2" />
            <rect x="20" y="26" width="44" height="34" rx="5" stroke="var(--chip-gold)" strokeWidth="1.6" />
            <path d="M20 36h44M20 50h44M40 26v34" stroke="var(--chip-gold)" strokeWidth="1.2" />
          </svg>
          <h1 className="font-display text-3xl font-semibold leading-tight mb-3">
            {BRAND.tagline}
          </h1>
          <p className="text-sm leading-relaxed max-w-sm" style={{ color: "var(--ink-100)" }}>
            Cada SIM tiene su hoja de vida: estado, número corto y cliente
            asignado, con historial completo y trazabilidad por usuario.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-xs" style={{ color: "var(--ink-100)", opacity: 0.6 }}>
            {BRAND.footer}
          </p>
          <p className="text-xs" style={{ color: "var(--ink-100)", opacity: 0.4 }}>
            {BRAND.productName} · v{BRAND.productVersion} · Creado por {BRAND.creator}, {BRAND.location}
          </p>
        </div>
      </div>

      {/* Panel derecho: formulario */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 md:hidden flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BRAND.mark} alt="" style={{ width: "28px", height: "28px" }} />
            <span className="font-display text-lg font-semibold tracking-wide uppercase">{BRAND.name}</span>
          </div>

          <h2 className="font-display text-xl font-semibold mb-1">Ingresar</h2>
          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
            Usa las credenciales que te asignó tu administrador.
          </p>

          <LoginForm />
        </div>
      </div>
    </main>
  );
}
