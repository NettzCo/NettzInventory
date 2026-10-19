"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { login } from "./actions";

export default function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await login(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="nombre@nettz.co"
          className="rounded-lg border px-3.5 py-2.5 text-sm outline-none transition"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Contraseña
          </label>
          <Link href="/forgot-password" className="text-xs" style={{ color: "var(--text-secondary)" }}>
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
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
        {isPending ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
