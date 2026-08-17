import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { redirect } from "next/navigation";
import { tieneModulo } from "@/lib/modules";
import NuevaEntregaForm from "./NuevaEntregaForm";
import CargaMasivaForm from "./CargaMasivaForm";
import InventarioTabs from "../InventarioTabs";

export default async function NuevaEntregaPage() {
  const { profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "inventario")) {
    redirect("/dashboard");
  }

  const supabase = await createClient();

  const { data: profiles } = await supabase
    .from("profiles_view")
    .select("id, full_name, modulos, role_es_sistema")
    .eq("organization_id", profile.organization_id)
    .eq("active", true)
    .order("full_name");

  const { data: proveedores } = await supabase
    .from("providers")
    .select("id, name")
    .eq("active", true)
    .order("name");

  const { data: apns } = await supabase
    .from("apns")
    .select("id, name")
    .eq("active", true)
    .order("name");

  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, nombre")
    .eq("active", true)
    .order("nombre");

  const comerciales = (profiles ?? []).filter((p) => tieneModulo(p, "inventario"));
  const brokers = profiles ?? []; // "Broker asociado" es informal/opcional: cualquier usuario activo puede aparecer aquí

  return (
    <main className="p-8">
      <InventarioTabs activo="nueva" />
      <h1 className="font-display text-2xl font-semibold mb-1">Registrar entrega</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Registra una o varias SIM cards entregadas a un mismo cliente, o usa la carga masiva para varias entregas a la vez.
      </p>

      <div className="mb-8 max-w-3xl">
        <CargaMasivaForm />
      </div>

      <NuevaEntregaForm
        comerciales={comerciales}
        brokers={brokers}
        proveedores={proveedores ?? []}
        apns={apns ?? []}
        clientes={clientes ?? []}
      />
    </main>
  );
}
