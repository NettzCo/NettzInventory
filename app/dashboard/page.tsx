import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { SimCurrentView } from "@/lib/types";
import { contarAlertasActivas } from "@/lib/alerts";
import { obtenerAlertasVistas } from "@/lib/alertReads";
import Link from "next/link";

export default async function InicioPage() {
  const { userId, profile } = await getCurrentProfile();
  const supabase = await createClient();

  const haceUnMes = new Date();
  haceUnMes.setDate(haceUnMes.getDate() - 30);

  const [{ data: sims }, clientesActivosRes, totalClientesRes, { data: activacionesRecientes }, vistas] = await Promise.all([
    supabase.from("sim_current_view").select("*"),
    supabase.from("clientes").select("id", { count: "exact", head: true }).eq("organization_id", profile.organization_id).eq("active", true),
    supabase.from("clientes").select("id", { count: "exact", head: true }).eq("organization_id", profile.organization_id),
    supabase
      .from("sim_status_history")
      .select("sim_id, sim_cards!inner(organization_id)")
      .eq("estado", "Activa")
      .eq("sim_cards.organization_id", profile.organization_id)
      .gte("changed_at", haceUnMes.toISOString()),
    obtenerAlertasVistas(supabase, userId),
  ]);

  const simsList = (sims ?? []) as SimCurrentView[];
  const totalSims = simsList.length;
  const alertasActivas = contarAlertasActivas(simsList, vistas);
  const totalClientes = totalClientesRes.count ?? 0;
  const clientesActivos = clientesActivosRes.count ?? 0;

  const porEstado: Record<string, number> = {};
  for (const s of simsList) {
    const estado = s.estado_actual ?? "Sin estado";
    porEstado[estado] = (porEstado[estado] ?? 0) + 1;
  }

  const activasPorProveedor: Record<string, number> = {};
  for (const s of simsList) {
    if (s.estado_actual !== "Activa") continue;
    activasPorProveedor[s.proveedor] = (activasPorProveedor[s.proveedor] ?? 0) + 1;
  }
  const proveedoresOrdenados = Object.entries(activasPorProveedor).sort((a, b) => b[1] - a[1]);

  const desactivadas = (porEstado["Desactivada"] ?? 0) + (porEstado["Desactivada temporal"] ?? 0);
  const activadasUltimoMes = new Set((activacionesRecientes ?? []).map((r) => r.sim_id)).size;

  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-semibold mb-1">Hola, {profile.full_name.split(" ")[0]}</h1>
      <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
        Así está tu operación de {profile.org_nombre} en este momento.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <TarjetaKPI label="SIMs en inventario" valor={totalSims} href="/dashboard/inventario" />
        <TarjetaKPI label="SIMs activas" valor={porEstado["Activa"] ?? 0} color="var(--state-activa)" href="/dashboard/inventario" />
        <TarjetaKPI label="SIMs desactivadas" valor={desactivadas} color="var(--state-desactivada)" href="/dashboard/inventario" />
        <TarjetaKPI label="Activadas último mes" valor={activadasUltimoMes} color="var(--chip-gold)" href="/dashboard/inventario" />
        <TarjetaKPI label="Clientes registrados" valor={totalClientes} sub={`${clientesActivos} activos`} href="/dashboard/clientes" />
        <TarjetaKPI
          label="Alertas sin resolver"
          valor={alertasActivas}
          color={alertasActivas > 0 ? "var(--state-lista)" : undefined}
          href="/dashboard/alertas"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="rounded-xl border bg-white p-6" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-display text-base font-semibold mb-4">SIMs activas por proveedor</h2>
          {proveedoresOrdenados.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Todavía no hay SIMs activas.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {proveedoresOrdenados.map(([proveedor, cantidad]) => {
                const max = proveedoresOrdenados[0][1];
                const pct = Math.round((cantidad / max) * 100);
                return (
                  <div key={proveedor}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{proveedor}</span>
                      <span style={{ color: "var(--text-secondary)" }}>{cantidad}</span>
                    </div>
                    <div className="h-2 rounded-full" style={{ background: "var(--bg)" }}>
                      <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: "var(--chip-gold)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-white p-6" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-display text-base font-semibold mb-4">Inventario por estado</h2>
          <div className="flex flex-col gap-3">
            {Object.entries(porEstado).sort((a, b) => b[1] - a[1]).map(([estado, cantidad]) => (
              <div key={estado} className="flex justify-between text-sm">
                <span>{estado}</span>
                <span className="font-medium" style={{ color: "var(--text-secondary)" }}>{cantidad}</span>
              </div>
            ))}
            {totalSims === 0 && <p className="text-sm" style={{ color: "var(--text-muted)" }}>Todavía no hay SIMs registradas.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}

function TarjetaKPI({
  label,
  valor,
  sub,
  color,
  href,
}: {
  label: string;
  valor: number;
  sub?: string;
  color?: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border bg-white p-5 flex flex-col gap-1 transition hover:shadow-sm"
      style={{ borderColor: "var(--border)" }}
    >
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className="font-display text-3xl font-semibold" style={{ color: color ?? "var(--text-primary)" }}>{valor}</span>
      {sub && <span className="text-xs" style={{ color: "var(--text-muted)" }}>{sub}</span>}
    </Link>
  );
}
