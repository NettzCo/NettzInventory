import Link from "next/link";
import ForgotPasswordForm from "./ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-sm">
        <h1 className="font-display text-xl font-semibold mb-1">Recuperar contraseña</h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
          Ingresa el correo con el que te registraron y te enviaremos un enlace para crear una contraseña nueva.
        </p>

        <ForgotPasswordForm />

        <Link href="/login" className="text-sm mt-6 inline-block" style={{ color: "var(--text-secondary)" }}>
          ← Volver a iniciar sesión
        </Link>
      </div>
    </main>
  );
}
