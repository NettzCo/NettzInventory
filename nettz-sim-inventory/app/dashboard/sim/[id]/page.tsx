import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { tieneModulo } from "@/lib/modules";
import { notFound } from "next/navigation";
import {
  SimCard,
  SimCurrentView,
  SimStatusHistory,
  SimShortNumber,
  SimAssignment,
  Profile,
  HojaDeVidaEvento,
} from "@/lib/types";
import HojaDeVida from "./HojaDeVida";

export default async function SimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await getCurrentProfile();
  const puedeEditar = tieneModulo(profile, "nueva");
  const supabase = await createClient();

  const [{ data: simCard }, { data: current }, { data: statusRows }, { data: shortRows }, { data: assignRows }, { data: profileRows }, { data: apnRows }, { data: clienteRows }] =
    await Promise.all([
      supabase.from("sim_cards").select("*").eq("id", id).single(),
      supabase.from("sim_current_view").select("*").eq("id", id).single(),
      supabase.from("sim_status_history").select("*").eq("sim_id", id).order("changed_at", { ascending: false }),
      supabase.from("sim_short_numbers").select("*").eq("sim_id", id).order("assigned_at", { ascending: false }),
      supabase.from("sim_assignments").select("*").eq("sim_id", id).order("assigned_at", { ascending: false }),
      supabase.from("profiles_view").select("*").eq("active", true).order("full_name"),
      supabase.from("apns").select("id, name").eq("active", true).order("name"),
      supabase.from("clientes").select("id, nombre").eq("active", true).order("nombre"),
    ]);

  if (!simCard) notFound();

  const profiles = (profileRows ?? []) as Profile[];
  const profileMap = new Map(profiles.map((p) => [p.id, p.full_name]));
  const nombreDe = (id: string | null) => (id ? profileMap.get(id) ?? "Usuario" : "—");

  const eventos: HojaDeVidaEvento[] = [];

  eventos.push({
    tipo: "creacion",
    fecha: (simCard as SimCard).created_at,
    titulo: "SIM registrada en el inventario",
    detalle: `Proveedor: ${(simCard as SimCard).proveedor}`,
    usuario_nombre: nombreDe((simCard as SimCard).created_by),
  });

  for (const s of (statusRows ?? []) as SimStatusHistory[]) {
    eventos.push({
      tipo: "estado",
      fecha: s.changed_at,
      titulo: `Estado cambiado a "${s.estado}"`,
      detalle: s.nota ?? "",
      usuario_nombre: nombreDe(s.changed_by),
    });
  }

  for (const n of (shortRows ?? []) as SimShortNumber[]) {
    eventos.push({
      tipo: "numero_corto",
      fecha: n.assigned_at,
      titulo: `Número corto asignado: ${n.numero_corto}`,
      detalle: n.unassigned_at ? `Vigente hasta ${new Date(n.unassigned_at).toLocaleDateString("es-CO")}` : "Vigente",
      usuario_nombre: nombreDe(n.assigned_by),
    });
  }

  for (const a of (assignRows ?? []) as SimAssignment[]) {
    eventos.push({
      tipo: "asignacion",
      fecha: a.assigned_at,
      titulo: `Asignada a cliente: ${a.cliente_nombre}`,
      detalle: `${a.plan_cantidad} ${a.plan_unidad} · ${a.tipo_plan} (${a.pago_momento}) · $${a.precio_cliente.toLocaleString("es-CO")} · Comercial: ${nombreDe(a.comercial_id)}${a.broker_id ? " · Broker: " + nombreDe(a.broker_id) : ""}${a.ended_at ? " · Finalizada " + new Date(a.ended_at).toLocaleDateString("es-CO") : " · Vigente"}`,
      usuario_nombre: nombreDe(a.created_by),
    });
  }

  eventos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  const comerciales = profiles.filter((p) => tieneModulo(p, "nueva"));
  const brokers = profiles; // "Broker asociado" es informal/opcional: cualquier usuario activo

  return (
    <HojaDeVida
      simCard={simCard as SimCard}
      current={current as SimCurrentView}
      eventos={eventos}
      comerciales={comerciales}
      brokers={brokers}
      apns={(apnRows ?? []) as { id: string; name: string }[]}
      clientes={(clienteRows ?? []).map((c) => ({ id: c.id, nombre: c.nombre }))}
      puedeEditar={puedeEditar}
    />
  );
}
