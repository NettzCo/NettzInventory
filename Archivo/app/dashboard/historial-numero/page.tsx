import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { tieneModulo } from "@/lib/modules";
import { formatFechaHora } from "@/lib/ui";
import Link from "next/link";
import InventarioTabs from "../InventarioTabs";

interface FilaHistorial {
  id: string;
  sim_id: string;
  icc: string;
  proveedor: string;
  assigned_at: string;
  unassigned_at: string | null;
  assigned_by_nombre: string;
  quedoDesactivada: boolean;
}

export default async function HistorialNumeroPage({
  searchParams,
}: {
  searchParams: Promise<{ numero?: string }>;
}) {
  const { profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "inventario")) {
    redirect("/dashboard");
  }

  const { numero } = await searchParams;
  const supabase = await createClient();
  const busqueda = numero?.trim() ?? "";

  let coincidencias: string[] = [];
  let filas: FilaHistorial[] = [];
  let error: string | null = null;

  if (busqueda) {
    // Primero vemos a cuántos números distintos les hace match la búsqueda
    // (por si escriben solo una parte) — si es más de uno, se pide elegir
    // cuál exactamente, para no mezclar la historia de dos números distintos.
    const { data: distintos, error: errorDistintos } = await supabase
      .from("sim_short_numbers")
      .select("numero_corto")
      .eq("organization_id", profile.organization_id)
      .ilike("numero_corto", `%${busqueda}%`);

    if (errorDistintos) {
      error = errorDistintos.message;
    } else {
      coincidencias = Array.from(new Set((distintos ?? []).map((d) => d.numero_corto))).sort();
    }

    // Si la búsqueda ya es exacta, o solo hay un número que coincide, se
    // muestra la historia directamente — sin pedir que elijan.
    const numeroExacto = coincidencias.includes(busqueda) ? busqueda : coincidencias.length === 1 ? coincidencias[0] : null;

    if (numeroExacto) {
      const { data: historial, error: errorHistorial } = await supabase
        .from("sim_short_numbers")
        .select("id, sim_id, assigned_at, unassigned_at, assigned_by, closed_by_bulk_operation_id, sim_cards(icc, proveedor)")
        .eq("organization_id", profile.organization_id)
        .eq("numero_corto", numeroExacto)
        .order("assigned_at", { ascending: true });

      if (errorHistorial) {
        error = errorHistorial.message;
      } else {
        const idsAsignadores = Array.from(new Set((historial ?? []).map((h) => h.assigned_by).filter(Boolean)));
        const { data: perfiles } = idsAsignadores.length > 0
          ? await supabase.from("profiles").select("id, full_name").in("id", idsAsignadores)
          : { data: [] as { id: string; full_name: string }[] };
        const nombrePorId = new Map((perfiles ?? []).map((p) => [p.id, p.full_name]));

        // Para cada tramo que se cerró por una reasignación (no por un
        // simple cambio manual), confirmamos si esa SIM efectivamente quedó
        // "Desactivada" como consecuencia — para poder contar bien la
        // historia ("se reasignó, y el ICC anterior quedó Desactivada").
        const conCierrePorOperacion = (historial ?? []).filter((h) => h.closed_by_bulk_operation_id);
        const desactivaciones = new Set<string>(); // `${sim_id}:${bulk_operation_id}`
        if (conCierrePorOperacion.length > 0) {
          const { data: statusRows } = await supabase
            .from("sim_status_history")
            .select("sim_id, bulk_operation_id")
            .eq("estado", "Desactivada")
            .in("sim_id", conCierrePorOperacion.map((h) => h.sim_id))
            .in("bulk_operation_id", conCierrePorOperacion.map((h) => h.closed_by_bulk_operation_id).filter(Boolean) as string[]);
          for (const s of statusRows ?? []) {
            desactivaciones.add(`${s.sim_id}:${s.bulk_operation_id}`);
          }
        }

        filas = (historial ?? []).map((h) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- el tipo generado por el join no refleja bien la forma real
          const sim = h.sim_cards as any;
          return {
            id: h.id,
            sim_id: h.sim_id,
            icc: sim?.icc ?? "—",
            proveedor: sim?.proveedor ?? "—",
            assigned_at: h.assigned_at,
            unassigned_at: h.unassigned_at,
            assigned_by_nombre: nombrePorId.get(h.assigned_by) ?? "—",
            quedoDesactivada: h.closed_by_bulk_operation_id ? desactivaciones.has(`${h.sim_id}:${h.closed_by_bulk_operation_id}`) : false,
          };
        });
      }
    }
  }

  const numeroExactoElegido = coincidencias.includes(busqueda) ? busqueda : coincidencias.length === 1 ? coincidencias[0] : null;
  const pidiendoElegir = busqueda && !numeroExactoElegido && coincidencias.length > 1;

  return (
    <main className="p-8">
      <InventarioTabs activo="historial-numero" />
      <h1 className="font-display text-2xl font-semibold mb-1">Historial de número corto</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Busca un número corto y ve todo lo que le ha pasado: a qué ICC se asignó, cuándo se liberó, y si eso
        dejó a la SIM anterior Desactivada.
      </p>

      <form className="flex flex-wrap items-end gap-3 mb-6" method="get">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Número corto</label>
          <input
            name="numero"
            defaultValue={numero ?? ""}
            placeholder="Ej: 9102550933"
            className="input-filter font-mono"
            style={{ width: "16rem" }}
          />
        </div>
        <button type="submit" className="rounded-lg border px-4 py-2 text-sm font-medium bg-white" style={{ borderColor: "var(--border)" }}>
          Buscar
        </button>
      </form>

      {error && (
        <p className="text-sm mb-4 rounded-lg p-3" style={{ background: "#FDEAEA", color: "var(--state-desactivada)" }}>
          No se pudo cargar la historia: {error}
        </p>
      )}

      {busqueda && !error && coincidencias.length === 0 && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Ese número corto nunca ha existido en el sistema.
        </p>
      )}

      {pidiendoElegir && (
        <div className="rounded-xl border bg-white p-5" style={{ borderColor: "var(--border)" }}>
          <p className="text-sm font-medium mb-3">
            Hay {coincidencias.length} números que coinciden con &quot;{busqueda}&quot; — elige cuál:
          </p>
          <div className="flex flex-wrap gap-2">
            {coincidencias.map((n) => (
              <Link
                key={n}
                href={`/dashboard/historial-numero?numero=${encodeURIComponent(n)}`}
                className="font-mono text-sm rounded-lg border px-3 py-1.5 hover:bg-[var(--bg)]"
                style={{ borderColor: "var(--border)" }}
              >
                {n}
              </Link>
            ))}
          </div>
        </div>
      )}

      {numeroExactoElegido && filas.length > 0 && (
        <div>
          <h2 className="font-display text-base font-semibold mb-4">
            Historia de <span className="font-mono">{numeroExactoElegido}</span>
          </h2>
          <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "var(--border)" }}>
            {[...filas].reverse().map((f, i) => (
              <div key={f.id} className="px-5 py-4 border-b last:border-0 flex items-start justify-between gap-4" style={{ borderColor: "var(--border)" }}>
                <div>
                  <p className="text-sm font-medium">
                    Asignado al ICC{" "}
                    <Link href={`/dashboard/sim/${f.sim_id}`} className="font-mono underline">{f.icc}</Link>
                    {" "}({f.proveedor})
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    Desde {formatFechaHora(f.assigned_at)} — registrado por {f.assigned_by_nombre}
                  </p>
                  {f.unassigned_at ? (
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                      Liberado el {formatFechaHora(f.unassigned_at)}
                      {f.quedoDesactivada && (
                        <> — esa SIM quedó <strong style={{ color: "var(--state-desactivada)" }}>Desactivada</strong> como consecuencia.</>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs mt-1 font-medium" style={{ color: "var(--state-activa)" }}>
                      Vigente — esta SIM lo tiene hoy.
                    </p>
                  )}
                </div>
                <span className="text-xs flex-shrink-0" style={{ color: "var(--text-muted)" }}>
                  #{filas.length - i}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {numeroExactoElegido && filas.length === 0 && !error && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No se encontró historia para ese número.
        </p>
      )}
    </main>
  );
}
