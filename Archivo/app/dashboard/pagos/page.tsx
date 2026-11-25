import { getCurrentProfile } from "@/lib/currentProfile";
import { redirect } from "next/navigation";
import { tieneModulo } from "@/lib/modules";
import { listarPagos } from "./actions";
import PagosManager from "./PagosManager";

export default async function PagosPage() {
  const { profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "pagos")) {
    redirect("/dashboard");
  }

  const pagos = await listarPagos();

  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-semibold mb-1">Pagos adelantados</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Registra los pagos que los clientes hacen por adelantado (normalmente un año completo) por un grupo de SIM —
        cada registro renueva automáticamente la fecha de vencimiento de esas SIM y genera un comprobante con número
        correlativo que puedes enviarles.
      </p>
      <PagosManager pagosIniciales={"error" in pagos ? [] : pagos} errorInicial={"error" in pagos ? pagos.error : null} />
    </main>
  );
}
