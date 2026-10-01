import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { tieneModulo } from "@/lib/modules";
import { Cliente } from "@/lib/types";
import ClientesManager from "./ClientesManager";

export default async function ClientesPage() {
  const { profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "clientes")) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const { data: clientes } = await supabase.from("clientes").select("*").order("nombre");

  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-semibold mb-1">Clientes</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Registra tus clientes aquí para que aparezcan como sugerencia al registrar una entrega.
      </p>
      <ClientesManager clientes={(clientes ?? []) as Cliente[]} />
    </main>
  );
}
