"use client";

import { useEffect } from "react";
import { traducirError } from "@/lib/friendlyError";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="p-8">
      <div
        className="rounded-xl border max-w-lg mx-auto mt-16 p-8 text-center bg-white"
        style={{ borderColor: "var(--border)" }}
      >
        <div style={{ fontSize: "36px", marginBottom: "12px" }}>⚠️</div>
        <h1 className="text-lg font-semibold mb-2">Algo no funcionó como esperábamos</h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
          {traducirError(error?.message)}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white"
            style={{ background: "var(--ink-900)" }}
          >
            Reintentar
          </button>
          <a
            href="/dashboard"
            className="rounded-lg border px-5 py-2.5 text-sm font-semibold bg-white"
            style={{ borderColor: "var(--border)" }}
          >
            Ir al inicio
          </a>
        </div>
        {error?.digest && (
          <p className="text-xs mt-5" style={{ color: "var(--text-muted)" }}>
            Código de referencia: {error.digest} — compártelo con soporte si el problema sigue.
          </p>
        )}
      </div>
    </main>
  );
}
