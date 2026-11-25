import ResetPasswordForm from "./ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-sm">
        <h1 className="font-display text-xl font-semibold mb-1">Crea tu nueva contraseña</h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
          Ya verificamos tu identidad a través del enlace del correo. Define tu nueva contraseña para continuar.
        </p>
        <ResetPasswordForm />
      </div>
    </main>
  );
}
