import { createClient } from "@/lib/supabase/server";
import { SimCurrentView, ESTADOS_SIM } from "@/lib/types";
import Link from "next/link";
import { addMonths } from "date-fns";
import StatusPill from "@/components/StatusPill";
import { formatFecha, formatPlan } from "@/lib/ui";
import InventarioTabs from "../InventarioTabs";
import PageSizeSelect from "./PageSizeSelect";

const TAMANOS_PAGINA = [50, 100, 150, 200];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    estado?: string;
    proveedor?: string;
    cliente?: string;
    plan_unidad?: string;
    tipo_plan?: string;
    precio_min?: string;
    precio_max?: string;
    fecha_desde?: string;
    fecha_hasta?: string;
    page?: string;
    per_page?: string;
  }>;
}) {
  const { estado, proveedor, cliente, plan_unidad, tipo_plan, precio_min, precio_max, fecha_desde, fecha_hasta, page: pageParam, per_page: perPageParam } = await searchParams;
  const supabase = await createClient();

  // Tamaño de página: solo se aceptan los valores del selector (50/100/150/200),
  // así nadie puede forzar por URL una página gigante que tumbe el navegador.
  const porPagina = TAMANOS_PAGINA.includes(Number(perPageParam)) ? Number(perPageParam) : 50;
  const paginaActual = Math.max(1, Number(pageParam) || 1);
  const desde = (paginaActual - 1) * porPagina;
  const hasta = desde + porPagina - 1;

  let query = supabase
    .from("sim_current_view")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (estado) query = query.eq("estado_actual", estado);
  if (proveedor) query = query.eq("proveedor", proveedor);
  if (cliente) query = query.ilike("cliente_actual", `%${cliente}%`);
  if (plan_unidad) query = query.eq("plan_unidad", plan_unidad);
  if (tipo_plan) query = query.eq("tipo_plan", tipo_plan);
  if (precio_min) query = query.gte("precio_cliente", Number(precio_min));
  if (precio_max) query = query.lte("precio_cliente", Number(precio_max));
  if (fecha_desde) query = query.gte("fecha_entrega", fecha_desde);
  if (fecha_hasta) query = query.lte("fecha_entrega", fecha_hasta);

  query = query.range(desde, hasta);

  const { data: sims, error, count } = await query;

  const totalSims = count ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(totalSims / porPagina));
  const paginaClamp = Math.min(paginaActual, totalPaginas);
  const rangoInicio = totalSims === 0 ? 0 : desde + 1;
  const rangoFin = Math.min(desde + porPagina, totalSims);

  const { data: proveedoresRows } = await supabase
    .from("sim_cards")
    .select("proveedor")
    .order("proveedor");
  const proveedores = Array.from(new Set((proveedoresRows ?? []).map((p) => p.proveedor)));

  const activeFilters = Object.entries({ estado, proveedor, cliente, plan_unidad, tipo_plan, precio_min, precio_max, fecha_desde, fecha_hasta })
    .filter(([, v]) => v) as [string, string][];
  const exportHref = "/dashboard/inventario/exportar?" + new URLSearchParams(activeFilters).toString();

  // Para armar los links de paginación conservando los filtros activos.
  function hrefPagina(nroPagina: number): string {
    const params = new URLSearchParams(activeFilters);
    params.set("per_page", String(porPagina));
    params.set("page", String(nroPagina));
    return `/dashboard/inventario?${params.toString()}`;
  }

  return (
    <main className="p-8">
      <InventarioTabs activo="inventario" />
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Inventario de SIM cards</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            {totalSims} SIM{totalSims === 1 ? "" : "s"} registrada{totalSims === 1 ? "" : "s"}
            {totalSims > 0 && ` · mostrando ${rangoInicio}–${rangoFin}`}
          </p>
        </div>
        <div className="flex gap-3">
          <a href={exportHref} className="rounded-lg border px-4 py-2.5 text-sm font-medium bg-white flex items-center" style={{ borderColor: "var(--border)" }}>
            {"\u2B07"} Exportar a Excel
          </a>
          <Link
            href="/dashboard/nueva"
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white flex items-center"
            style={{ background: "var(--ink-900)" }}
          >
            + Registrar entrega
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <form className="flex flex-wrap items-end gap-3 mb-5" method="get">
        <FilterField label="Estado">
          <select name="estado" defaultValue={estado ?? ""} className="input-filter">
            <option value="">Todos los estados</option>
            {ESTADOS_SIM.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Proveedor">
          <select name="proveedor" defaultValue={proveedor ?? ""} className="input-filter">
            <option value="">Todos los proveedores</option>
            {proveedores.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Cliente">
          <input name="cliente" defaultValue={cliente ?? ""} placeholder="Buscar cliente…" className="input-filter" />
        </FilterField>

        <FilterField label="Unidad">
          <select name="plan_unidad" defaultValue={plan_unidad ?? ""} className="input-filter">
            <option value="">Megas / Gigas</option>
            <option value="Megas">Megas</option>
            <option value="Gigas">Gigas</option>
          </select>
        </FilterField>

        <FilterField label="Tipo de plan">
          <select name="tipo_plan" defaultValue={tipo_plan ?? ""} className="input-filter">
            <option value="">Prepago / Postpago</option>
            <option value="Prepago">Prepago</option>
            <option value="Postpago">Postpago</option>
          </select>
        </FilterField>

        <FilterField label="Precio mín.">
          <input name="precio_min" type="number" defaultValue={precio_min ?? ""} placeholder="$" className="input-filter" style={{ width: "6.5rem" }} />
        </FilterField>

        <FilterField label="Precio máx.">
          <input name="precio_max" type="number" defaultValue={precio_max ?? ""} placeholder="$" className="input-filter" style={{ width: "6.5rem" }} />
        </FilterField>

        <FilterField label="Entrega desde">
          <input name="fecha_desde" type="date" defaultValue={fecha_desde ?? ""} className="input-filter" />
        </FilterField>

        <FilterField label="Entrega hasta">
          <input name="fecha_hasta" type="date" defaultValue={fecha_hasta ?? ""} className="input-filter" />
        </FilterField>

        <FilterField label="SIM por página">
          <PageSizeSelect value={porPagina} opciones={TAMANOS_PAGINA} />
        </FilterField>

        <button
          type="submit"
          className="rounded-lg border px-4 py-2 text-sm font-medium bg-white"
          style={{ borderColor: "var(--border)" }}
        >
          Aplicar filtros
        </button>

        {activeFilters.length > 0 && (
          <Link href="/dashboard/inventario" className="text-sm pb-2" style={{ color: "var(--text-secondary)" }}>
            Limpiar filtros
          </Link>
        )}
      </form>

      {error && (
        <div className="rounded-lg p-4 text-sm mb-4" style={{ background: "#FDEAEA", color: "var(--state-desactivada)" }}>
          No se pudo cargar el inventario: {error.message}
        </div>
      )}

      <div className="rounded-xl border overflow-hidden bg-white" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              <Th>ICC</Th>
              <Th>Proveedor</Th>
              <Th>N.° corto</Th>
              <Th>Cliente</Th>
              <Th>Plan</Th>
              <Th>Estado</Th>
              <Th>Desde</Th>
              <Th>Vence el</Th>
            </tr>
          </thead>
          <tbody>
            {(sims as SimCurrentView[] | null)?.map((sim) => (
              <tr
                key={sim.id}
                className="border-b last:border-0 hover:bg-[var(--bg)] cursor-pointer transition"
                style={{ borderColor: "var(--border)" }}
              >
                <td className="p-0">
                  <Link href={`/dashboard/sim/${sim.id}`} className="block px-4 py-3 icc-number">
                    {sim.icc}
                  </Link>
                </td>
                <Td><Link href={`/dashboard/sim/${sim.id}`} className="block">{sim.proveedor}</Link></Td>
                <Td><Link href={`/dashboard/sim/${sim.id}`} className="block font-mono">{sim.numero_corto_actual ?? "—"}</Link></Td>
                <Td><Link href={`/dashboard/sim/${sim.id}`} className="block">{sim.cliente_actual ?? "—"}</Link></Td>
                <Td>
                  <Link href={`/dashboard/sim/${sim.id}`} className="block">
                    {formatPlan(sim.plan_cantidad, sim.plan_unidad)}
                    {sim.tipo_plan && (
                      <span className="ml-1" style={{ color: "var(--text-muted)" }}>· {sim.tipo_plan}</span>
                    )}
                  </Link>
                </Td>
                <td className="px-4 py-3">
                  <Link href={`/dashboard/sim/${sim.id}`}>
                    <StatusPill estado={sim.estado_actual} />
                  </Link>
                </td>
                <Td><Link href={`/dashboard/sim/${sim.id}`} className="block">{formatFecha(sim.estado_desde)}</Link></Td>
                <Td>
                  <Link href={`/dashboard/sim/${sim.id}`} className="block">
                    {sim.estado_actual === "Activa" && sim.tipo_plan === "Prepago" && sim.estado_desde
                      ? formatFecha(addMonths(new Date(sim.estado_desde), sim.duracion_meses ?? 12).toISOString())
                      : "—"}
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>

        {sims?.length === 0 && (
          <div className="p-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No hay SIMs que coincidan con estos filtros.
          </div>
        )}
      </div>

      {totalSims > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Página {paginaClamp} de {totalPaginas}
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={hrefPagina(1)}
              aria-disabled={paginaClamp <= 1}
              className="rounded-lg border px-3 py-1.5 text-sm font-medium bg-white"
              style={{ borderColor: "var(--border)", opacity: paginaClamp <= 1 ? 0.4 : 1, pointerEvents: paginaClamp <= 1 ? "none" : "auto" }}
            >
              « Primera
            </Link>
            <Link
              href={hrefPagina(paginaClamp - 1)}
              aria-disabled={paginaClamp <= 1}
              className="rounded-lg border px-3 py-1.5 text-sm font-medium bg-white"
              style={{ borderColor: "var(--border)", opacity: paginaClamp <= 1 ? 0.4 : 1, pointerEvents: paginaClamp <= 1 ? "none" : "auto" }}
            >
              ‹ Anterior
            </Link>
            <Link
              href={hrefPagina(paginaClamp + 1)}
              aria-disabled={paginaClamp >= totalPaginas}
              className="rounded-lg border px-3 py-1.5 text-sm font-medium bg-white"
              style={{ borderColor: "var(--border)", opacity: paginaClamp >= totalPaginas ? 0.4 : 1, pointerEvents: paginaClamp >= totalPaginas ? "none" : "auto" }}
            >
              Siguiente ›
            </Link>
            <Link
              href={hrefPagina(totalPaginas)}
              aria-disabled={paginaClamp >= totalPaginas}
              className="rounded-lg border px-3 py-1.5 text-sm font-medium bg-white"
              style={{ borderColor: "var(--border)", opacity: paginaClamp >= totalPaginas ? 0.4 : 1, pointerEvents: paginaClamp >= totalPaginas ? "none" : "auto" }}
            >
              Última »
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3">{children}</td>;
}
function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{label}</label>
      {children}
    </div>
  );
}
