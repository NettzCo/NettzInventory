import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { redirect } from "next/navigation";
import { tieneModulo } from "@/lib/modules";
import { BulkOperation } from "@/lib/types";
import NuevaEntregaForm from "./NuevaEntregaForm";
import CargaMasivaForm from "./CargaMasivaForm";
import HistorialEntregas from "./HistorialEntregas";
import InventarioTabs from "../InventarioTabs";

export default async function NuevaEntregaPage() {
  const { userId, profile } = await getCurrentProfile();
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

  const { data: operaciones } = await supabase
    .from("bulk_operations")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .eq("tipo", "registro_entrega")
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: usuariosOrg } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("organization_id", profile.organization_id);
  const nombrePorId: Record<string, string> = {};
  for (const u of usuariosOrg ?? []) nombrePorId[u.id] = u.full_name;

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

      <div className="mt-8">
        <HistorialEntregas
          operaciones={(operaciones ?? []) as BulkOperation[]}
          nombrePorId={nombrePorId}
          currentUserId={userId}
          esSuperAdmin={profile.role_es_sistema}
        />
      </div>
    </main>
  );
}
