import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { tieneModulo } from "@/lib/modules";
import { construirReportesActivaciones, nombreMes, FilaReporte } from "@/lib/reportesActivaciones";

function aArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ proveedores?: string | string[] }>;
}) {
  const { profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "reportes")) {
    redirect("/dashboard");
  }

  const { proveedores } = await searchParams;
  const proveedoresSeleccionados = aArray(proveedores);

  const supabase = await createClient();
  const { data: proveedoresRows } = await supabase.from("providers").select("name").eq("active", true).order("name");
  const todosProveedores = (proveedoresRows ?? []).map((p) => p.name);

  const { activaciones, desactivaciones, entregas } = await construirReportesActivaciones(
    supabase,
    profile.organization_id,
    proveedoresSeleccionados
  );

  const proveedoresColumnas = proveedoresSeleccionados.length > 0 ? proveedoresSeleccionados : todosProveedores;

  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-semibold mb-1">Reportes</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Actividad mes a mes por operador. Aquí se irán agregando más reportes con el tiempo.
      </p>

      <form method="get" className="mb-6">
        <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Operadores a incluir (ninguno marcado = todos)</p>
        <div className="flex flex-wrap gap-3 mb-3">
          {todosProveedores.map((p) => (
            <label key={p} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="proveedores" value={p} defaultChecked={proveedoresSeleccionados.includes(p)} />
              {p}
            </label>
          ))}
        </div>
        <button type="submit" className="rounded-lg border px-4 py-2 text-sm font-medium bg-white" style={{ borderColor: "var(--border)" }}>
          Aplicar filtro
        </button>
      </form>

      <div className="flex flex-col gap-8">
        <TablaReporte
          titulo="Activaciones por mes"
          descripcion="Cuántas SIM pasaron a estado 'Activa' cada mes, por operador."
          filas={activaciones}
          proveedores={proveedoresColumnas}
        />
        <TablaReporte
          titulo="Desactivaciones por mes"
          descripcion="Cuántas SIM pasaron a estado 'Desactivada' cada mes, por operador."
          filas={desactivaciones}
          proveedores={proveedoresColumnas}
        />
        <TablaReporte
          titulo="Entregas por mes"
          descripcion="Cuántas SIM se entregaron a un cliente cada mes, por operador (según su fecha de entrega)."
          filas={entregas}
          proveedores={proveedoresColumnas}
        />
      </div>
    </main>
  );
}

function TablaReporte({
  titulo,
  descripcion,
  filas,
  proveedores,
}: {
  titulo: string;
  descripcion: string;
  filas: FilaReporte[];
  proveedores: string[];
}) {
  return (
    <section className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "var(--border)" }}>
      <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-display text-base font-semibold">{titulo}</h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{descripcion}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide whitespace-nowrap">Mes</th>
              {proveedores.map((p) => (
                <th key={p} className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-right whitespace-nowrap">{p}</th>
              ))}
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide text-right whitespace-nowrap">Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.mes} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-3 whitespace-nowrap capitalize">{nombreMes(f.mes)}</td>
                {proveedores.map((p) => (
                  <td key={p} className="px-4 py-3 text-right">{f.porProveedor[p] ?? 0}</td>
                ))}
                <td className="px-4 py-3 text-right font-semibold">{f.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filas.length === 0 && (
          <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No hay datos todavía para este reporte.
          </div>
        )}
      </div>
    </section>
  );
}
