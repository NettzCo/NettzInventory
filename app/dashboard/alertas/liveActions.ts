"use server";

import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { contarAlertasActivas } from "@/lib/alerts";
import { construirAlertasChat, AlertaChat } from "@/lib/chatAlerts";
import { SimCurrentView } from "@/lib/types";

export async function obtenerConteoAlertas(): Promise<number> {
  const { userId, profile } = await getCurrentProfile();
  const supabase = await createClient();
  const [{ data: sims }, alertasChat] = await Promise.all([
    supabase.from("sim_current_view").select("*"),
    construirAlertasChat(supabase, userId, profile.organization_id),
  ]);
  return contarAlertasActivas((sims ?? []) as SimCurrentView[]) + alertasChat.length;
}

export async function obtenerAlertasChatLive(): Promise<AlertaChat[]> {
  const { userId, profile } = await getCurrentProfile();
  const supabase = await createClient();
  return construirAlertasChat(supabase, userId, profile.organization_id);
}
