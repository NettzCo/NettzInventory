import LoginForm from "./LoginForm";
import { BRAND } from "@/lib/branding";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex" style={{ background: "var(--bg)" }}>
      {/* Panel izquierdo: identidad, visible desde tablet en adelante */}
      <div
        className="hidden md:flex md:w-[42%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: "var(--chip-gold)", color: "var(--ink-900)" }}
      >
        <div className="inline-flex items-center rounded-xl px-4 py-3" style={{ background: "var(--ink-900)", width: "fit-content" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND.logoFull} alt={BRAND.name} style={{ height: "36px", width: "auto" }} />
        </div>

        <div>
          {/* Motivo del chip de la SIM, como firma visual del producto */}
          <svg width="120" height="80" viewBox="0 0 120 80" fill="none" className="mb-8 opacity-90">
            <rect x="0.5" y="0.5" width="119" height="79" rx="10" stroke="var(--ink-900)" strokeWidth="1.5" />
            <rect x="16" y="16" width="34" height="34" rx="4" fill="var(--ink-900)" fillOpacity="0.15" />
            <path d="M22 24h22M22 32h22M22 40h14" stroke="var(--ink-900)" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <h1 className="font-display text-3xl font-semibold leading-tight mb-3">
            {BRAND.tagline}
          </h1>
