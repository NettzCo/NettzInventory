import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Organization } from "@/lib/types";
import OrganizacionesManager from "./OrganizacionesManager";

export default async function OrganizacionesPage() {
  const { profile } = await getCurrentProfile();
  if (!profile.puede_gestionar_organizaciones) redirect("/dashboard");

  const supabase = await createClient();
  const { data: organizaciones } = await supabase.from("organizations").select("*").order("created_at");

  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-semibold mb-1">Organizaciones</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Crea un cliente nuevo con su propio logo, colores, usuarios y datos — completamente aislado del resto.
      </p>
      <OrganizacionesManager organizaciones={(organizaciones ?? []) as Organization[]} />
    </main>
  );
}
