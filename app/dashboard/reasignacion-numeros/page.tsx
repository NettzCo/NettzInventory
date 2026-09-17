import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { tieneModulo } from "@/lib/modules";
import { BulkOperation } from "@/lib/types";
import InventarioTabs from "../InventarioTabs";
import ReasignacionNumerosManager from "./ReasignacionNumerosManager";

export default async function ReasignacionNumerosPage() {
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
      .eq("tipo", "reasignacion_numero")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("profiles").select("id, full_name").eq("organization_id", profile.organization_id),
  ]);

  const nombrePorId: Record<string, string> = {};
  for (const u of usuarios ?? []) nombrePorId[u.id] = u.full_name;

  return (
    <main className="p-8">
      <InventarioTabs activo="reasignacion-numeros" />
      <h1 className="font-display text-2xl font-semibold mb-1">Reasignar números cortos</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Solo para SIMs Claro. Escribe el número corto y el ICC al que quieres pasarlo — uno solo, o
        varios (uno por línea). El sistema revisa cada número antes de aplicar nada: si ya
        pertenece a otro ICC, ese ICC queda Desactivada automáticamente; si el ICC destino ya
        tenía otro número, ese número queda suelto.
      </p>
      <ReasignacionNumerosManager operaciones={(operaciones ?? []) as BulkOperation[]} nombrePorId={nombrePorId} currentUserId={userId} esSuperAdmin={profile.role_es_sistema} />
    </main>
  );
}
