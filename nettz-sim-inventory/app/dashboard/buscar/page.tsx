import { createClient } from "@/lib/supabase/server";
import { SimCurrentView } from "@/lib/types";
import Link from "next/link";
import StatusPill from "@/components/StatusPill";
import { formatFecha } from "@/lib/ui";

function parseTerminos(q: string): string[] {
  return q
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default async function BusquedaRapidaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const terminos = q ? parseTerminos(q) : [];

  let resultados: SimCurrentView[] = [];
  let noEncontrados: string[] = [];

  if (terminos.length > 0) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("sim_current_view")
      .select("*")
      .or(
        `icc.in.(${terminos.join(",")}),numero_corto_actual.in.(${terminos.join(",")})`
      );

    resultados = (data ?? []) as SimCurrentView[];

    const encontrados = new Set([
      ...resultados.map((r) => r.icc),
      ...resultados.map((r) => r.numero_corto_actual).filter(Boolean),
    ]);
    noEncontrados = terminos.filter((t) => !encontrados.has(t));
  }

  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-semibold mb-1">Búsqueda rápida</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Pega uno o varios ICC o números cortos (separados por espacio, coma o salto de línea).
      </p>

      <form method="get" className="mb-6">
        <textarea
          name="q"
          defaultValue={q ?? ""}
          rows={3}
          placeholder={"89570123456789012345\n3001234567"}
          className="w-full rounded-lg border px-3.5 py-2.5 text-sm font-mono outline-none mb-3"
          style={{ borderColor: "var(--border)" }}
        />
        <button
          type="submit"
          className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
          style={{ background: "var(--ink-900)" }}
        >
          Buscar
        </button>
      </form>

      {terminos.length > 0 && (
        <>
          {noEncontrados.length > 0 && (
            <div className="rounded-lg p-3 text-sm mb-4" style={{ background: "#FDF3E4", color: "var(--state-lista)" }}>
              No se encontró ninguna SIM con: {noEncontrados.join(", ")}
            </div>
          )}

          {resultados.length > 0 && (
            <div className="flex gap-3 mb-4">
              <a
                href={`/dashboard/buscar/exportar?tipo=simple&q=${encodeURIComponent(q ?? "")}`}
                className="rounded-lg border px-4 py-2 text-sm font-medium bg-white"
                style={{ borderColor: "var(--border)" }}
              >
                ⬇ Descargar (simple)
              </a>
              <a
                href={`/dashboard/buscar/exportar?tipo=completa&q=${encodeURIComponent(q ?? "")}`}
                className="rounded-lg border px-4 py-2 text-sm font-medium bg-white"
                style={{ borderColor: "var(--border)" }}
              >
                ⬇ Descargar (completa, con hoja de vida)
              </a>
            </div>
          )}

          <div className="rounded-xl border overflow-x-auto bg-white" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm" style={{ minWidth: "1400px" }}>
              <thead>
                <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                  <Th>ICC</Th>
                  <Th>Proveedor</Th>
                  <Th>APN</Th>
                  <Th>N.° corto</Th>
                  <Th>Cliente</Th>
                  <Th>Plan</Th>
                  <Th>Tipo de plan</Th>
                  <Th>Forma de pago</Th>
                  <Th>Precio</Th>
                  <Th>Comercial</Th>
                  <Th>Broker</Th>
                  <Th>Fecha de entrega</Th>
                  <Th>Estado</Th>
                  <Th>Desde el último cambio</Th>
                  <Th>Observaciones</Th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((sim) => (
                  <tr key={sim.id} className="border-b last:border-0 hover:bg-[var(--bg)] transition" style={{ borderColor: "var(--border)" }}>
                    <td className="p-0">
                      <Link href={`/dashboard/sim/${sim.id}`} className="block px-4 py-3 icc-number whitespace-nowrap">{sim.icc}</Link>
                    </td>
                    <td className="p-0">
                      <Link href={`/dashboard/sim/${sim.id}`} className="block px-4 py-3 whitespace-nowrap">{sim.proveedor}</Link>
                    </td>
                    <td className="p-0">
                      <Link href={`/dashboard/sim/${sim.id}`} className="block px-4 py-3 font-mono whitespace-nowrap">{sim.apn ?? "—"}</Link>
                    </td>
                    <td className="p-0">
                      <Link href={`/dashboard/sim/${sim.id}`} className="block px-4 py-3 font-mono whitespace-nowrap">{sim.numero_corto_actual ?? "—"}</Link>
                    </td>
                    <td className="p-0">
                      <Link href={`/dashboard/sim/${sim.id}`} className="block px-4 py-3 whitespace-nowrap">{sim.cliente_actual ?? "—"}</Link>
                    </td>
                    <td className="p-0">
                      <Link href={`/dashboard/sim/${sim.id}`} className="block px-4 py-3 whitespace-nowrap">
                        {sim.plan_cantidad ? `${sim.plan_cantidad} ${sim.plan_unidad}` : "—"}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link href={`/dashboard/sim/${sim.id}`} className="block px-4 py-3 whitespace-nowrap">{sim.tipo_plan ?? "—"}</Link>
                    </td>
                    <td className="p-0">
                      <Link href={`/dashboard/sim/${sim.id}`} className="block px-4 py-3 whitespace-nowrap">{sim.pago_momento ?? "—"}</Link>
                    </td>
                    <td className="p-0">
                      <Link href={`/dashboard/sim/${sim.id}`} className="block px-4 py-3 whitespace-nowrap">
                        {sim.precio_cliente != null ? `$${sim.precio_cliente.toLocaleString("es-CO")}` : "—"}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link href={`/dashboard/sim/${sim.id}`} className="block px-4 py-3 whitespace-nowrap">{sim.comercial_nombre ?? "—"}</Link>
                    </td>
                    <td className="p-0">
                      <Link href={`/dashboard/sim/${sim.id}`} className="block px-4 py-3 whitespace-nowrap">{sim.broker_nombre ?? "—"}</Link>
                    </td>
                    <td className="p-0">
                      <Link href={`/dashboard/sim/${sim.id}`} className="block px-4 py-3 whitespace-nowrap">{formatFecha(sim.fecha_entrega)}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/sim/${sim.id}`}><StatusPill estado={sim.estado_actual} /></Link>
                    </td>
                    <td className="p-0">
                      <Link href={`/dashboard/sim/${sim.id}`} className="block px-4 py-3 whitespace-nowrap">{formatFecha(sim.estado_desde)}</Link>
                    </td>
                    <td className="p-0">
                      <Link href={`/dashboard/sim/${sim.id}`} className="block px-4 py-3" style={{ maxWidth: "16rem" }}>{sim.observaciones ?? "—"}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {resultados.length === 0 && (
              <div className="p-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                Sin resultados.
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">{children}</th>;
}
