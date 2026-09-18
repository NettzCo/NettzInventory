"use server";

import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { contarAlertasActivas } from "@/lib/alerts";
import { obtenerAlertasVistas } from "@/lib/alertReads";
import { construirAlertasChat, AlertaChat } from "@/lib/chatAlerts";
import { construirAlertasPedidos, AlertaPedido } from "@/lib/pedidoAlerts";
import { traerSimsPrepagoActivas } from "@/lib/simQueries";
import { revalidatePath } from "next/cache";

export async function obtenerConteoAlertas(): Promise<number> {
  const { userId, profile } = await getCurrentProfile();
  const supabase = await createClient();
  const [sims, alertasPedidos, vistas] = await Promise.all([
    traerSimsPrepagoActivas(supabase),
    construirAlertasPedidos(supabase, userId, profile.organization_id),
    obtenerAlertasVistas(supabase, userId),
  ]);
  // El chat NO cuenta aquí — tiene su propio contador en el módulo Chat.
  return contarAlertasActivas(sims, vistas) + alertasPedidos.length;
}

/** Total de mensajes de chat sin leer (todas las conversaciones sumadas) —
 *  para el globito del módulo Chat, separado por completo de Alertas. */
export async function obtenerConteoChatNoLeido(): Promise<number> {
  const { userId, profile } = await getCurrentProfile();
  const supabase = await createClient();
  const alertasChat = await construirAlertasChat(supabase, userId, profile.organization_id);
  return alertasChat.reduce((total, a) => total + a.cantidad, 0);
}

export async function obtenerAlertasChatLive(): Promise<AlertaChat[]> {
  const { userId, profile } = await getCurrentProfile();
  const supabase = await createClient();
  return construirAlertasChat(supabase, userId, profile.organization_id);
}

export async function obtenerAlertasPedidosLive(): Promise<AlertaPedido[]> {
  const { userId, profile } = await getCurrentProfile();
  const supabase = await createClient();
  return construirAlertasPedidos(supabase, userId, profile.organization_id);
}

/** Marca como vista una o varias alertas de vencimiento — cada una atada a
 *  su fecha de vencimiento actual, así si esa fecha cambia después
 *  (renovación, corrección) la alerta vuelve a contar como nueva. */
export async function marcarAlertasVistas(items: { simId: string; fechaAniversario: string }[]) {
  const { userId } = await getCurrentProfile();
  const supabase = await createClient();

  const filas = items.map((i) => ({
    sim_id: i.simId,
    user_id: userId,
    fecha_aniversario: i.fechaAniversario.slice(0, 10),
  }));
  if (filas.length === 0) return { ok: true };

  const { error } = await supabase.from("sim_alert_reads").upsert(filas, { onConflict: "sim_id,user_id,fecha_aniversario" });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/alertas");
  revalidatePath("/dashboard");
  return { ok: true };
}
