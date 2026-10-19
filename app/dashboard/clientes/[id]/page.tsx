import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { tieneModulo } from "@/lib/modules";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Cliente, SimCurrentView } from "@/lib/types";
import { formatCodigoCliente, formatFecha, formatFechaHora, formatMoneda, estadoEfectivo } from "@/lib/ui";
import DesactivarClientePanel from "./DesactivarClientePanel";
import { buscarDesactivacionVigente } from "./actions";

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "clientes")) {
    redirect("/dashboard");
  }

  const supabase = await createClient();

  const { data: clienteRow } = await supabase
    .from("clientes")
    .select("*, kam:profiles!clientes_kam_id_fkey(full_name)")
    .eq("id", id)
    .maybeSingle();

  if (!clienteRow || clienteRow.organization_id !== profile.organization_id) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- el tipo generado por el join no refleja bien la forma real
  const kam = clienteRow.kam as any;
  const cliente = {
    ...(clienteRow as unknown as Cliente),
    kam_nombre: Array.isArray(kam) ? kam[0]?.full_name ?? null : kam?.full_name ?? null,
  };

  const [{ data: simsRows }, { data: pagosRows }] = await Promise.all([
    supabase
      .from("sim_current_view")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .eq("cliente_actual", cliente.nombre)
      .order("fecha_entrega", { ascending: false }),
    tieneModulo(profile, "pagos")
      ? supabase
          .from("pagos_adelantados")
          .select("id, numero_comprobante, fecha_pago, valor_total")
          .eq("organization_id", profile.organization_id)
          .eq("cliente_nombre", cliente.nombre)
          .order("fecha_pago", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; numero_comprobante: string; fecha_pago: string; valor_total: number }[] }),
  ]);

  const sims = (simsRows ?? []) as SimCurrentView[];
  const desactivacionVigente = await buscarDesactivacionVigente(cliente.nombre);
  const proveedoresDisponibles = Array.from(new Set(sims.map((s) => s.proveedor))).sort();

  return (
    <main className="p-8">
      <Link href="/dashboard/clientes" className="text-sm hover:underline" style={{ color: "var(--text-secondary)" }}>
        ← Volver a Clientes
      </Link>

      <div className="flex items-center gap-3 mt-3 mb-1">
        <h1 className="font-display text-2xl font-semibold">{cliente.nombre}</h1>
        <span
          className="status-pill"
          style={{ background: cliente.active ? "#E7F5EC" : "#EEF0F4", color: cliente.active ? "var(--state-activa)" : "var(--text-muted)" }}
        >
          {cliente.active ? "Activo" : "Inactivo"}
        </span>
      </div>
      <p className="text-sm mb-6 font-mono" style={{ color: "var(--text-muted)" }}>{formatCodigoCliente(cliente.codigo)}</p>

      {/* Todos los campos del cliente */}
      <section className="rounded-xl border bg-white p-6 mb-6" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-display text-base font-semibold mb-4">Datos del cliente</h2>
        <div className="grid md:grid-cols-3 gap-x-6 gap-y-4 text-sm">
          <Campo label="Contacto responsable" valor={cliente.contacto_responsable} />
          <Campo label="Documento / NIT" valor={cliente.documento} />
          <Campo label="Teléfono" valor={cliente.telefono} />
          <Campo label="Correo" valor={cliente.correo} />
          <Campo label="Dirección" valor={cliente.direccion} />
          <Campo label="Industria" valor={cliente.industria} />
          <Campo label="KAM" valor={cliente.kam_nombre} />
          <Campo label="Broker" valor={cliente.broker} />
          <Campo label="Fecha de vinculación" valor={cliente.fecha_vinculacion ? formatFecha(cliente.fecha_vinculacion) : null} />
          <Campo label="Registrado" valor={formatFechaHora(cliente.created_at)} />
        </div>
        {cliente.observaciones && (
          <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>OBSERVACIONES</p>
            <p>{cliente.observaciones}</p>
          </div>
        )}
      </section>

      <DesactivarClientePanel
        clienteNombre={cliente.nombre}
        proveedoresDisponibles={proveedoresDisponibles}
        desactivacionVigente={desactivacionVigente}
        puedeEditar={tieneModulo(profile, "clientes")}
      />

      {/* SIM asignadas */}
      <section className="rounded-xl border bg-white overflow-hidden mb-6" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-display text-base font-semibold">SIM asignadas</h2>
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{sims.length} SIM</span>
        </div>
        {sims.length === 0 ? (
          <p className="px-6 py-8 text-sm text-center" style={{ color: "var(--text-muted)" }}>Este cliente no tiene SIM asignadas actualmente.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">ICC</th>
                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Proveedor</th>
                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Número corto</th>
                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Plan</th>
                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Estado</th>
                <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Vence</th>
              </tr>
            </thead>
            <tbody>
              {sims.map((s) => (
                <tr key={s.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="px-6 py-3">
                    <Link href={`/dashboard/sim/${s.id}`} className="font-mono hover:underline" style={{ color: "var(--ink-900)" }}>
                      {s.icc}
                    </Link>
                  </td>
                  <td className="px-6 py-3">{s.proveedor}</td>
                  <td className="px-6 py-3">{s.numero_corto_actual ?? "—"}</td>
                  <td className="px-6 py-3">
                    {s.plan_cantidad && s.plan_unidad ? `${s.plan_cantidad} ${s.plan_unidad}` : "—"}
                    {s.precio_cliente != null && <span style={{ color: "var(--text-muted)" }}> · {formatMoneda(s.precio_cliente)}</span>}
                  </td>
                  <td className="px-6 py-3">{estadoEfectivo(s)}</td>
                  <td className="px-6 py-3">{s.fecha_entrega ? formatFecha(s.fecha_entrega) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Pagos adelantados, si el módulo está activo */}
      {tieneModulo(profile, "pagos") && (
        <section className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
            <h2 className="font-display text-base font-semibold">Pagos adelantados</h2>
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{(pagosRows ?? []).length} pago{(pagosRows ?? []).length === 1 ? "" : "s"}</span>
          </div>
          {(pagosRows ?? []).length === 0 ? (
            <p className="px-6 py-8 text-sm text-center" style={{ color: "var(--text-muted)" }}>Este cliente no tiene pagos adelantados registrados.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                  <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Comprobante</th>
                  <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Fecha de pago</th>
                  <th className="px-6 py-3 font-medium text-xs uppercase tracking-wide">Valor</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {(pagosRows ?? []).map((p) => (
                  <tr key={p.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                    <td className="px-6 py-3 font-medium">{p.numero_comprobante}</td>
                    <td className="px-6 py-3">{formatFecha(p.fecha_pago)}</td>
                    <td className="px-6 py-3">{formatMoneda(p.valor_total)}</td>
                    <td className="px-6 py-3 text-right">
                      <Link href={`/dashboard/pagos/comprobante/${p.id}`} target="_blank" className="text-sm font-medium hover:underline" style={{ color: "var(--ink-900)" }}>
                        Ver PDF
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </main>
  );
}

function Campo({ label, valor }: { label: string; valor: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium mb-0.5" style={{ color: "var(--text-secondary)" }}>{label.toUpperCase()}</p>
      <p>{valor || "—"}</p>
    </div>
  );
}
