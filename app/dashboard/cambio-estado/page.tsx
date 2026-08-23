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

  const [{ data: operaciones }, { data: usuarios }] = await Promise.all([
    supabase
      .from("bulk_operations")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("profiles").select("id, full_name").eq("organization_id", profile.organization_id),
  ]);

  const nombrePorId: Record<string, string> = {};
  for (const u of usuarios ?? []) nombrePorId[u.id] = u.full_name;

  return (
    <main className="p-8">
      <InventarioTabs activo="cambio-estado" />
      <h1 className="font-display text-2xl font-semibold mb-1">Cambio de estado</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Solo aplica a SIM que ya fueron entregadas a un cliente. Cámbialas una por una, o pega varios
        ICC de una vez (por ejemplo, cuando 1000 SIM entregadas van pasando de &quot;Lista para activar&quot; a &quot;Activa&quot;
        a medida que el cliente las va usando).
      </p>
      <CambioEstadoManager
        operaciones={(operaciones ?? []) as BulkOperation[]}
        nombrePorId={nombrePorId}
        currentUserId={userId}
        esSuperAdmin={profile.role_es_sistema}
      />
    </main>
  );
}
