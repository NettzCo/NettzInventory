import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { tieneModulo } from "@/lib/modules";
import { SimShortNumberStatus } from "@/lib/types";
import Link from "next/link";
import InventarioTabs from "../../InventarioTabs";

export default async function NumerosDisponiblesPage() {
  const { profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "inventario")) {
    redirect("/dashboard");
  }

  const supabase = await createClient();

  // "Disponibles para reasignar" = números Claro que:
  //   1) hoy están en un ICC "Desactivada" (todavía atados a esa SIM, pero
  //      esa SIM ya no los está usando), o
  //   2) no tienen ningún ICC asignado en este momento (quedaron sueltos
  //      tras una reasignación desde el módulo de "Reasignar números").
  const { data, error } = await supabase
    .from("sim_short_number_status_view")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .ilike("proveedor", "claro")
    .or("disponible.eq.true,estado_actual.eq.Desactivada")
    .order("numero_corto");

  const numeros = (data ?? []) as SimShortNumberStatus[];
  const enIccDesactivado = numeros.filter((n) => !n.disponible);
  const sueltos = numeros.filter((n) => n.disponible);

  return (
    <main className="p-8">
      <InventarioTabs activo="numeros-disponibles" />
      <h1 className="font-display text-2xl font-semibold mb-1">Números disponibles</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Números cortos de Claro que se pueden reasignar hoy — porque el ICC que los tiene está{" "}
        <strong>Desactivada</strong>, o porque no tienen ningún ICC asignado. Para moverlos a otra
        SIM, usa{" "}
        <Link href="/dashboard/reasignacion-numeros" className="underline font-medium">
          Reasignar números
        </Link>
        .
      </p>

      {error && (
        <p className="text-sm mb-4 rounded-lg p-3" style={{ background: "#FDEAEA", color: "var(--state-desactivada)" }}>
          No se pudo cargar la lista: {error.message}
        </p>
      )}

      <section className="rounded-xl border bg-white overflow-hidden mb-8" style={{ borderColor: "var(--border)" }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-display text-base font-semibold">
            En un ICC Desactivada · {enIccDesactivado.length}
          </h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            El número sigue registrado en esta SIM, pero como está Desactivada, se puede tomar y
            pasar a otra.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">N.° corto</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">ICC actual</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Cliente</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {enIccDesactivado.map((n) => (
              <tr key={n.numero_corto} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-3 font-mono">{n.numero_corto}</td>
                <td className="px-4 py-3 font-mono">
                  <Link href={`/dashboard/sim/${n.sim_id_actual}`} className="underline">{n.icc_actual}</Link>
                </td>
                <td className="px-4 py-3">{n.cliente_actual ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <Link href="/dashboard/reasignacion-numeros" className="text-sm font-medium hover:underline" style={{ color: "var(--ink-900)" }}>
                    Reasignar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {enIccDesactivado.length === 0 && !error && (
          <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No hay números Claro en SIM Desactivadas en este momento.
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-display text-base font-semibold">
            Sueltos, sin ICC asignado · {sueltos.length}
          </h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Números que quedaron libres tras una reasignación — no pertenecen a ninguna SIM.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">N.° corto</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {sueltos.map((n) => (
              <tr key={n.numero_corto} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-3 font-mono">{n.numero_corto}</td>
                <td className="px-4 py-3 text-right">
                  <Link href="/dashboard/reasignacion-numeros" className="text-sm font-medium hover:underline" style={{ color: "var(--ink-900)" }}>
                    Asignar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sueltos.length === 0 && !error && (
          <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No hay números Claro sueltos en este momento.
          </div>
        )}
      </section>
    </main>
  );
}
