import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { tieneModulo } from "@/lib/modules";
import { BulkOperation } from "@/lib/types";
import InventarioTabs from "../InventarioTabs";
import CambioEstadoManager from "./CambioEstadoManager";

export default async function CambioEstadoPage() {
  const { userId, profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "inventario")) {
    redirect("/dashboard");
  }

  const supabase = await createClient();

  const [{ data: operaciones }, { data: usuarios }, { data: clientes }, { data: profilesView }] = await Promise.all([
    supabase
      .from("bulk_operations")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("profiles").select("id, full_name").eq("organization_id", profile.organization_id),
    supabase.from("clientes").select("id, nombre").eq("organization_id", profile.organization_id).eq("active", true).order("nombre"),
    supabase.from("profiles_view").select("id, full_name, modulos, role_es_sistema").eq("organization_id", profile.organization_id).eq("active", true).order("full_name"),
  ]);

  const nombrePorId: Record<string, string> = {};
  for (const u of usuarios ?? []) nombrePorId[u.id] = u.full_name;

  const comerciales = (profilesView ?? []).filter((p) => tieneModulo(p, "inventario"));

  return (
    <main className="p-8">
      <InventarioTabs activo="cambio-estado" />
      <h1 className="font-display text-2xl font-semibold mb-1">Cambios</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Cambia el estado, el cliente responsable, el plan (tipo y cantidad) o el precio de una o
        varias SIM ya entregadas — de una en una, o pegando varios ICC a la vez. Puedes marcar
        cualquier combinación de estos cambios en la misma operación.
      </p>
      <CambioEstadoManager
        operaciones={(operaciones ?? []) as BulkOperation[]}
        nombrePorId={nombrePorId}
        currentUserId={userId}
        esSuperAdmin={profile.role_es_sistema}
        clientes={clientes ?? []}
        comerciales={comerciales}
      />
    </main>
  );
}
