import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { SimCurrentView, ESTADOS_SIM, EstadoSim } from "@/lib/types";
import { calcularAlertas, DIAS_ALERTA_DEFAULT, ESTADOS_ALERTA_DEFAULT } from "@/lib/alerts";
import { obtenerAlertasVistas } from "@/lib/alertReads";
import { construirAlertasChat } from "@/lib/chatAlerts";
import { construirAlertasPedidos } from "@/lib/pedidoAlerts";
import AlertasChatLive from "./AlertasChatLive";
import AlertasPedidosLive from "./AlertasPedidosLive";
import AlertasVencimientoTable from "./AlertasVencimientoTable";
import FormAutoSubmit from "./FormAutoSubmit";

const UMBRALES = [7, 15, 30, 60];

function aArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export default async function AlertasPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string; proveedor?: string; estados?: string | string[] }>;
}) {
  const { dias, proveedor, estados } = await searchParams;
  const umbral = dias ? Number(dias) : DIAS_ALERTA_DEFAULT;
  const estadosSeleccionados = (aArray(estados) as EstadoSim[]).length > 0 ? (aArray(estados) as EstadoSim[]) : ESTADOS_ALERTA_DEFAULT;

  const { userId, profile } = await getCurrentProfile();
  const supabase = await createClient();
  const [{ data: sims }, alertasChat, alertasPedidos, vistas] = await Promise.all([
    supabase.from("sim_current_view").select("*"),
    construirAlertasChat(supabase, userId, profile.organization_id),
    construirAlertasPedidos(supabase, userId, profile.organization_id),
    obtenerAlertasVistas(supabase, userId),
  ]);

  const { data: proveedoresRows } = await supabase.from("sim_cards").select("proveedor").order("proveedor");
  const proveedores = Array.from(new Set((proveedoresRows ?? []).map((p) => p.proveedor)));

  const alertas = calcularAlertas((sims ?? []) as SimCurrentView[], vistas, {
    estados: estadosSeleccionados,
    proveedor: proveedor || undefined,
    umbralDias: umbral,
  });
  const vencidas = alertas.filter((a) => a.diasRestantes < 0);

  const queryExport = new URLSearchParams();
  queryExport.set("dias", String(umbral));
  if (proveedor) queryExport.set("proveedor", proveedor);
  estadosSeleccionados.forEach((e) => queryExport.append("estados", e));

  return (
    <main className="p-8">
      <AlertasPedidosLive inicial={alertasPedidos} organizationId={profile.organization_id} currentUserId={userId} />
      <AlertasChatLive inicial={alertasChat} organizationId={profile.organization_id} currentUserId={userId} />

      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="font-display text-2xl font-semibold">Alertas de vencimiento</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            SIM prepago que cumplen (o ya cumplieron) su plazo (6 o 12 meses, según cada una) desde su última activación.
          </p>
        </div>
        <a href={`/dashboard/alertas/exportar?${queryExport.toString()}`} className="rounded-lg border px-4 py-2.5 text-sm font-medium bg-white flex items-center" style={{ borderColor: "var(--border)" }}>
          {"\u2B07"} Descargar listado
        </a>
      </div>

      {/* Filtros */}
      <FormAutoSubmit className="mt-5 mb-2 flex flex-wrap items-start gap-8">
        <div>
          <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Anticipación</p>
          <div className="flex gap-2">
            {UMBRALES.map((u) => (
              <label key={u} className="cursor-pointer">
                <input type="radio" name="dias" value={u} defaultChecked={umbral === u} className="peer hidden" />
                <span
                  className="peer-checked:!bg-[var(--ink-900)] peer-checked:!text-white rounded-lg border px-3 py-1.5 text-sm font-medium block transition"
                  style={{ borderColor: "var(--border)", background: "white", color: "var(--text-primary)" }}
                >
                  {u} días
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Proveedor</p>
          <select name="proveedor" defaultValue={proveedor ?? ""} className="input-filter">
            <option value="">Todos los proveedores</option>
            {proveedores.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div>
          <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Estados a incluir</p>
          <div className="flex flex-wrap gap-3">
            {ESTADOS_SIM.map((e) => (
              <label key={e} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="estados" value={e} defaultChecked={estadosSeleccionados.includes(e)} />
                {e}
              </label>
            ))}
          </div>
        </div>

        <div className="self-end">
          <button
            type="submit"
            className="rounded-lg border px-4 py-2 text-sm font-medium bg-white"
            style={{ borderColor: "var(--border)" }}
          >
            Aplicar filtros
          </button>
        </div>
      </FormAutoSubmit>

      <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
        Los filtros se aplican al instante al elegirlos — el botón "Aplicar filtros" es solo un respaldo.
      </p>
      <p className="text-xs mb-6" style={{ color: "var(--text-muted)" }}>
        Por defecto solo se muestran SIM actualmente <strong>Activas</strong>. Marca otros estados
        para incluir también, por ejemplo, las que ya se desactivaron después de cumplir el año.
      </p>

      {alertas.length === 0 ? (
        <div className="rounded-xl border bg-white p-10 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          No hay SIM prepago que coincidan con estos filtros dentro del umbral elegido.
        </div>
      ) : (
        <>
          {vencidas.length > 0 && (
            <div className="rounded-lg px-4 py-2.5 text-sm mb-4" style={{ background: "#FDEAEA", color: "var(--state-desactivada)" }}>
              {vencidas.length} SIM ya cumplieron su plazo desde su última activación.
            </div>
          )}

          <AlertasVencimientoTable alertas={alertas} />
        </>
      )}
    </main>
  );
}
