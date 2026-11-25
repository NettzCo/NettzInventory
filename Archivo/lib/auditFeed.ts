import { createClient } from "@/lib/supabase/server";

export interface EventoLog {
  id: string;
  fecha: string;
  usuario_id: string;
  tipo: string;
  descripcion: string;
}

interface SimCardMini {
  icc: string;
}

export async function construirFeedLogs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string
): Promise<EventoLog[]> {
  const [
    { data: auditRows },
    { data: statusRows },
    { data: assignRows },
    { data: bulkRows },
    { data: clientesRows },
    { data: pedidosRows },
    { data: gruposRows },
  ] = await Promise.all([
    supabase.from("audit_log").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(150),
    supabase
      .from("sim_status_history")
      .select("id, sim_id, estado, nota, changed_by, changed_at, sim_cards!inner(icc, organization_id)")
      .eq("sim_cards.organization_id", organizationId)
      .order("changed_at", { ascending: false })
      .limit(150),
    supabase
      .from("sim_assignments")
      .select("id, sim_id, cliente_nombre, created_by, assigned_at, sim_cards!inner(icc, organization_id)")
      .eq("sim_cards.organization_id", organizationId)
      .order("assigned_at", { ascending: false })
      .limit(150),
    supabase.from("bulk_operations").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(100),
    supabase.from("clientes").select("id, nombre, created_by, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(100),
    supabase
      .from("pedidos")
      .select("id, cliente_nombre, created_by, created_at, enviado_by, enviado_at, rechazado_by, rechazado_at, motivo_rechazo")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("chat_groups").select("id, name, created_by, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(50),
  ]);

  const eventos: EventoLog[] = [];

  for (const a of auditRows ?? []) {
    eventos.push({ id: `audit-${a.id}`, fecha: a.created_at, usuario_id: a.user_id, tipo: a.entidad, descripcion: `${a.accion}${a.detalle ? ` — ${a.detalle}` : ""}` });
  }

  for (const s of (statusRows ?? []) as unknown as { id: string; sim_id: string; estado: string; nota: string | null; changed_by: string; changed_at: string; sim_cards: SimCardMini }[]) {
    eventos.push({
      id: `estado-${s.id}`,
      fecha: s.changed_at,
      usuario_id: s.changed_by,
      tipo: "SIM",
      descripcion: `Cambió el estado de la SIM ${s.sim_cards?.icc ?? s.sim_id} a "${s.estado}"${s.nota ? ` (${s.nota})` : ""}`,
    });
  }

  for (const a of (assignRows ?? []) as unknown as { id: string; sim_id: string; cliente_nombre: string; created_by: string; assigned_at: string; sim_cards: SimCardMini }[]) {
    eventos.push({
      id: `asignacion-${a.id}`,
      fecha: a.assigned_at,
      usuario_id: a.created_by,
      tipo: "SIM",
      descripcion: `Asignó la SIM ${a.sim_cards?.icc ?? a.sim_id} al cliente "${a.cliente_nombre}"`,
    });
  }

  for (const b of bulkRows ?? []) {
    const tipoLabel = b.tipo === "cambio_estado" ? "Cambio de estado masivo" : "Entrega";
    eventos.push({ id: `bulk-${b.id}`, fecha: b.created_at, usuario_id: b.created_by, tipo: tipoLabel, descripcion: b.nota ?? `${b.cantidad_sims} SIM afectadas` });
    if (b.revertida_at && b.revertida_by) {
      eventos.push({ id: `bulk-revert-${b.id}`, fecha: b.revertida_at, usuario_id: b.revertida_by, tipo: "Reversión", descripcion: `Deshizo una operación: ${b.nota ?? tipoLabel}` });
    }
  }

  for (const c of clientesRows ?? []) {
    eventos.push({ id: `cliente-${c.id}`, fecha: c.created_at, usuario_id: c.created_by, tipo: "Cliente", descripcion: `Registró el cliente "${c.nombre}"` });
  }

  for (const p of pedidosRows ?? []) {
    eventos.push({ id: `pedido-${p.id}`, fecha: p.created_at, usuario_id: p.created_by, tipo: "Pedido", descripcion: `Registró un pedido para "${p.cliente_nombre}"` });
    if (p.enviado_by && p.enviado_at) {
      eventos.push({ id: `pedido-enviado-${p.id}`, fecha: p.enviado_at, usuario_id: p.enviado_by, tipo: "Pedido", descripcion: `Marcó como enviado el pedido de "${p.cliente_nombre}"` });
    }
    if (p.rechazado_by && p.rechazado_at) {
      eventos.push({
        id: `pedido-rechazado-${p.id}`,
        fecha: p.rechazado_at,
        usuario_id: p.rechazado_by,
        tipo: "Pedido",
        descripcion: `Rechazó el pedido de "${p.cliente_nombre}"${p.motivo_rechazo ? `: ${p.motivo_rechazo}` : ""}`,
      });
    }
  }

  for (const g of gruposRows ?? []) {
    eventos.push({ id: `grupo-${g.id}`, fecha: g.created_at, usuario_id: g.created_by, tipo: "Chat", descripcion: `Creó el grupo de chat "${g.name}"` });
  }

  eventos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  return eventos.slice(0, 300);
}
