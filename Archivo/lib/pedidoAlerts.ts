import { createClient } from "@/lib/supabase/server";

export interface AlertaPedido {
  id: string;
  clienteNombre: string;
  cantidad: number;
  createdAt: string;
}

// A diferencia del chat, un pedido no se "marca como leído" — la alerta se
// resuelve sola cuando la persona asignada lo marca como Enviado.
export async function construirAlertasPedidos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  organizationId: string
): Promise<AlertaPedido[]> {
  const { data } = await supabase
    .from("pedidos")
    .select("id, cliente_nombre, cantidad, created_at")
    .eq("organization_id", organizationId)
    .eq("asignado_a", userId)
    .eq("estado", "Pendiente")
    .order("created_at", { ascending: false });

  return (data ?? []).map((p) => ({
    id: p.id,
    clienteNombre: p.cliente_nombre,
    cantidad: p.cantidad,
    createdAt: p.created_at,
  }));
}
