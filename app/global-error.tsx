"use client";

import { useEffect } from "react";
import { traducirError } from "@/lib/friendlyError";

export default function GlobalError({
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
    <html lang="es">
      <body style={{ margin: 0, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: "#f4f3ee" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
          <div style={{ maxWidth: "440px", textAlign: "center" }}>
            <div style={{ fontSize: "40px", marginBottom: "16px" }}>⚠️</div>
            <h1 style={{ fontSize: "20px", fontWeight: 600, margin: "0 0 8px", color: "#101010" }}>
              Algo no funcionó como esperábamos
            </h1>
            <p style={{ fontSize: "14px", color: "#6b6a63", margin: "0 0 24px", lineHeight: 1.6 }}>
              {traducirError(error?.message)}
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button
                onClick={() => reset()}
                style={{
                  background: "#101010", color: "#fff", border: "none", borderRadius: "8px",
                  padding: "10px 20px", fontSize: "14px", fontWeight: 600, cursor: "pointer",
                }}
              >
                Reintentar
              </button>
              <button
                onClick={() => { window.location.href = "/dashboard"; }}
                style={{
                  background: "#fff", color: "#101010", border: "1px solid #d3d1c7", borderRadius: "8px",
                  padding: "10px 20px", fontSize: "14px", fontWeight: 600, cursor: "pointer",
                }}
              >
                Ir al inicio
              </button>
            </div>
            {error?.digest && (
              <p style={{ fontSize: "11px", color: "#92918a", marginTop: "20px" }}>
                Código de referencia: {error.digest} — compártelo con soporte si el problema sigue.
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
