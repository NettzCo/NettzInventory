import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Profile, Provider, Apn, RoleRow } from "@/lib/types";
import ConfiguracionTabs from "./ConfiguracionTabs";

export default async function ConfiguracionPage() {
  const { profile } = await getCurrentProfile();
  if (!profile.role_es_sistema) redirect("/dashboard");

  const supabase = await createClient();
  const [{ data: usuarios }, { data: roles }, { data: proveedores }, { data: apns }] = await Promise.all([
    supabase.from("profiles_view").select("*").order("full_name"),
    supabase.from("roles").select("*").order("is_system", { ascending: false }).order("name"),
    supabase.from("providers").select("*").order("name"),
    supabase.from("apns").select("*").order("name"),
  ]);

  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-semibold mb-1">Configuración</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Usuarios, roles, proveedores y APN — todo lo administrable de la plataforma, en un solo lugar.
      </p>
      <ConfiguracionTabs
        usuarios={(usuarios ?? []) as Profile[]}
        roles={(roles ?? []) as RoleRow[]}
        proveedores={(proveedores ?? []) as Provider[]}
        apns={(apns ?? []) as Apn[]}
      />
    </main>
  );
}
