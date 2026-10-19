import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { tieneModulo } from "@/lib/modules";
import { Cliente } from "@/lib/types";
import ClientesManager from "./ClientesManager";

const SELECT_CLIENTE_CON_NOMBRES = "*, kam:profiles!clientes_kam_id_fkey(full_name)";

export default async function ClientesPage() {
  const { profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "clientes")) {
    redirect("/dashboard");
  }

  const supabase = await createClient();

  // Paginado de a 1000 — sin esto, con más de 1000 clientes Supabase corta
  // la lista en silencio (ya nos pasó con el inventario de SIM).
  const PAGINA = 1000;
  const filasCrudas: Record<string, unknown>[] = [];
  let desde = 0;
  while (true) {
    const { data } = await supabase.from("clientes").select(SELECT_CLIENTE_CON_NOMBRES).order("nombre").range(desde, desde + PAGINA - 1);
    if (!data || data.length === 0) break;
    filasCrudas.push(...data);
    if (data.length < PAGINA) break;
    desde += PAGINA;
  }

  const clientes: Cliente[] = filasCrudas.map((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- el tipo generado por el join no refleja bien la forma real
    const kam = c.kam as any;
    return {
      ...(c as unknown as Cliente),
      kam_nombre: Array.isArray(kam) ? kam[0]?.full_name ?? null : kam?.full_name ?? null,
    };
  });

  const { data: usuarios } = await supabase
    .from("profiles_view")
    .select("id, full_name")
    .eq("organization_id", profile.organization_id)
    .eq("active", true)
    .order("full_name");

  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-semibold mb-1">Clientes</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Registra tus clientes aquí para que aparezcan como sugerencia al registrar una entrega.
      </p>
      <ClientesManager clientes={clientes} usuarios={usuarios ?? []} />
    </main>
  );
}
