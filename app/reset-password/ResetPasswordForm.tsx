"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [sesionValida, setSesionValida] = useState<boolean | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // El enlace del correo crea una sesión temporal de "recuperación" — si
    // no existe (enlace vencido, ya usado, o se abrió esta página directo),
    // avisamos en vez de dejar el formulario ahí sin explicación.
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setSesionValida(!!data.session));
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== password2) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }

    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError("No se pudo actualizar la contraseña. Solicita un nuevo enlace de recuperación.");
        return;
      }
      setListo(true);
      setTimeout(() => router.push("/dashboard"), 1500);
    });
  }

  if (sesionValida === false) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm rounded-lg px-4 py-3" style={{ background: "#FDEAEA", color: "var(--state-desactivada)" }}>
          Este enlace ya no es válido (venció o ya se usó). Solicita uno nuevo desde &ldquo;Olvidé mi contraseña&rdquo;.
        </p>
      </div>
    );
  }

  if (listo) {
    return (
      <p className="text-sm rounded-lg px-4 py-3" style={{ background: "#E7F5EC", color: "var(--state-activa)" }}>
        Contraseña actualizada. Entrando a la plataforma…
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          Nueva contraseña
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border px-3.5 py-2.5 text-sm outline-none transition"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password2" className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          Confirmar contraseña
        </label>
        <input
          id="password2"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Repite la contraseña"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
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
        {isPending ? "Guardando…" : "Guardar nueva contraseña"}
      </button>
    </form>
  );
}
