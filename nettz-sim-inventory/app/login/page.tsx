import Image from "next/image";
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
        <Image src={BRAND.logoFull} alt={BRAND.name} width={160} height={50} style={{ width: "auto", height: "34px" }} priority />

        <div>
          {/* Motivo del chip de la SIM, como firma visual del producto */}
          <svg width="120" height="80" viewBox="0 0 120 80" fill="none" className="mb-8 opacity-90">
            <rect x="0.5" y="0.5" width="119" height="79" rx="10" stroke="var(--chip-gold)" strokeWidth="1.5" />
            <rect x="16" y="16" width="34" height="34" rx="4" fill="var(--chip-gold)" fillOpacity="0.18" />
            <path d="M22 24h22M22 32h22M22 40h14" stroke="var(--chip-gold)" strokeWidth="1.6" strokeLinecap="round" />
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
          <div className="mb-8 md:hidden">
            <Image src={BRAND.logoFull} alt={BRAND.name} width={140} height={44} style={{ width: "auto", height: "26px" }} priority />
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
