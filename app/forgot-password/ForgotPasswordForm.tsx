"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      // No revelamos si el correo existe o no en la plataforma (por seguridad,
      // para no confirmar a un desconocido qué correos están registrados).
      if (error) setError("No se pudo enviar el correo. Intenta de nuevo en unos minutos.");
      else setEnviado(true);
    });
  }

  if (enviado) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm rounded-lg px-4 py-3" style={{ background: "#E7F5EC", color: "var(--state-activa)" }}>
          Si ese correo está registrado, te enviamos un enlace para restablecer tu contraseña.
          Revisa tu bandeja de entrada (y la carpeta de spam) — el enlace vence en un par de horas.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          Correo registrado
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="nombre@nettz.co"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border px-3.5 py-2.5 text-sm outline-none transition"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        />
      </div>

      {error && (
        <p className="text-sm rounded-lg px-3 py-2" style={{ background: "#FDEAEA", color: "var(--state-desactivada)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="mt-2 rounded-lg py-2.5 text-sm font-semibold text-white transition disabled:opacity-60"
        style={{ background: "var(--ink-900)" }}
      >
        {isPending ? "Enviando…" : "Enviar enlace de recuperación"}
      </button>
    </form>
  );
}
