import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { tieneModulo } from "@/lib/modules";
import { Pedido } from "@/lib/types";
import PedidosManager from "./PedidosManager";

export default async function PedidosPage() {
  const { userId, profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "pedidos")) {
    redirect("/dashboard");
  }

  const supabase = await createClient();

  const [{ data: pedidos }, { data: clientes }, { data: proveedores }, { data: apns }, { data: usuarios }] = await Promise.all([
    supabase.from("pedidos").select("*").eq("organization_id", profile.organization_id).order("created_at", { ascending: false }),
    supabase.from("clientes").select("id, nombre").eq("organization_id", profile.organization_id).eq("active", true).order("nombre"),
    supabase.from("providers").select("id, name").eq("active", true).order("name"),
    supabase.from("apns").select("id, name").eq("active", true).order("name"),
    supabase
      .from("profiles_view")
      .select("id, full_name")
      .eq("organization_id", profile.organization_id)
      .eq("active", true)
      .order("full_name"),
  ]);

  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-semibold mb-1">Pedidos de SIM cards</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Registra un pedido que te haga un cliente y asígnalo a la persona que lo va a despachar —
        le llega como alerta hasta que confirme que ya lo envió.
      </p>
      <PedidosManager
        pedidos={(pedidos ?? []) as Pedido[]}
        clientes={clientes ?? []}
        proveedores={proveedores ?? []}
        apns={apns ?? []}
        usuarios={usuarios ?? []}
        currentUserId={userId}
        esSuperAdmin={profile.role_es_sistema}
      />
    </main>
  );
}
