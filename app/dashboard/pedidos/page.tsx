import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { tieneModulo } from "@/lib/modules";
import { Pedido, PedidoEnvio } from "@/lib/types";
import PedidosManager from "./PedidosManager";

const POR_PAGINA = 25;
const ESTADOS = ["Pendiente", "Enviado", "Rechazado"] as const;

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; pagina?: string }>;
}) {
  const { q: qParam, estado: estadoParam, pagina: paginaParam } = await searchParams;
  const { userId, profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "pedidos")) {
    redirect("/dashboard");
  }

  const supabase = await createClient();

  const estado = ESTADOS.find((e) => e === estadoParam) ?? "";
  // Se quitan los caracteres que tienen significado especial en los filtros de la API.
  const busqueda = (qParam ?? "").replace(/[%,()*\\]/g, " ").trim().slice(0, 80);
  const pagina = Math.max(1, Math.floor(Number(paginaParam) || 1));
  const desde = (pagina - 1) * POR_PAGINA;

  // Buscar por número de guía, transportadora o ICC: se resuelve primero en
  // los envíos y luego se incluyen esos pedidos en la búsqueda.
  let idsPorEnvio: string[] = [];
  if (busqueda) {
    const { data: envios } = await supabase
      .from("pedido_envios")
      .select("pedido_id")
      .eq("organization_id", profile.organization_id)
      .or(`numero_guia.ilike.%${busqueda}%,transportadora.ilike.%${busqueda}%,iccs.cs.{${busqueda}}`)
      .limit(200);
    idsPorEnvio = Array.from(new Set((envios ?? []).map((e) => e.pedido_id as string)));
  }

  let consulta = supabase
    .from("pedidos")
    .select("*", { count: "exact" })
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false })
    .range(desde, desde + POR_PAGINA - 1);
  if (estado) consulta = consulta.eq("estado", estado);
  if (busqueda) {
    const filtros = [`cliente_nombre.ilike.%${busqueda}%`, `ciudad.ilike.%${busqueda}%`, `contacto_nombre.ilike.%${busqueda}%`];
    if (idsPorEnvio.length > 0) filtros.push(`id.in.(${idsPorEnvio.join(",")})`);
    consulta = consulta.or(filtros.join(","));
  }

  const [{ data: pedidos, count }, { data: clientes }, { data: proveedores }, { data: apns }, { data: usuarios }] = await Promise.all([
    consulta,
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

  const idsPagina = (pedidos ?? []).map((p) => p.id as string);
  const { data: enviosRows } = idsPagina.length
    ? await supabase.from("pedido_envios").select("*").in("pedido_id", idsPagina).order("fecha_envio", { ascending: true })
    : { data: [] as PedidoEnvio[] };
  const enviosPorPedido = new Map<string, PedidoEnvio[]>();
  for (const e of (enviosRows ?? []) as PedidoEnvio[]) {
    enviosPorPedido.set(e.pedido_id, [...(enviosPorPedido.get(e.pedido_id) ?? []), e]);
  }

  const pedidosList = ((pedidos ?? []) as Pedido[]).map((p) => ({ ...p, envios: enviosPorPedido.get(p.id) ?? [] }));

  // Marca como "visto" (para el doble check del creador) todos los pedidos
  // pendientes que te asignaron y que todavía no habías abierto — se hace
  // solo, sin que el usuario tenga que hacer nada.
  const idsParaMarcarVisto = pedidosList
    .filter((p) => p.asignado_a === userId && p.estado === "Pendiente" && !p.visto_at)
    .map((p) => p.id);

  if (idsParaMarcarVisto.length > 0) {
    const ahora = new Date().toISOString();
    await supabase.from("pedidos").update({ visto_at: ahora }).in("id", idsParaMarcarVisto);
    for (const p of pedidosList) {
      if (idsParaMarcarVisto.includes(p.id)) p.visto_at = ahora;
    }
  }

  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-semibold mb-1">Pedidos de SIM cards</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Registra un pedido que te haga un cliente y asígnalo a la persona que lo va a despachar —
        le llega como alerta hasta que confirme que ya lo envió.
      </p>
      <PedidosManager
        key={`${estado}|${busqueda}|${pagina}`}
        pedidos={pedidosList}
        total={count ?? 0}
        pagina={pagina}
        porPagina={POR_PAGINA}
        busqueda={busqueda}
        estadoFiltro={estado}
        clientes={clientes ?? []}
        proveedores={proveedores ?? []}
        apns={apns ?? []}
        usuarios={usuarios ?? []}
        currentUserId={userId}
        esSuperAdmin={profile.role_es_sistema}
        organizationId={profile.organization_id}
      />
    </main>
  );
}
