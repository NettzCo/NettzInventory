"use server";

import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getAdapter } from "@/lib/integrations/registry";
import { mapEstadoGenerico } from "@/lib/integrations/types";

async function requireSuperAdmin() {
  const { userId, profile } = await getCurrentProfile();
  if (!profile.role_es_sistema) {
    throw new Error("Solo un super administrador puede realizar esta acción.");
  }
  return userId;
}

export async function guardarIntegracion(
  providerId: string,
  input: { integration_slug: string; api_enabled: boolean; api_base_url: string; api_key: string; api_secret: string }
) {
  await requireSuperAdmin();
  const supabase = await createClient();

  const { error: provError } = await supabase
    .from("providers")
    .update({
      integration_slug: input.integration_slug || null,
      api_enabled: input.api_enabled,
      api_base_url: input.api_base_url || null,
    })
    .eq("id", providerId);
  if (provError) return { error: provError.message };

  if (input.api_key || input.api_secret) {
    const { error: credError } = await supabase
      .from("provider_credentials")
      .upsert({
        provider_id: providerId,
        api_key: input.api_key || null,
        api_secret: input.api_secret || null,
        updated_at: new Date().toISOString(),
      });
    if (credError) return { error: credError.message };
  }

  revalidatePath("/dashboard/configuracion");
  return { ok: true };
}

export async function probarConexion(providerId: string) {
  await requireSuperAdmin();
  const supabase = await createClient();

  const { data: provider } = await supabase.from("providers").select("*").eq("id", providerId).single();
  if (!provider) return { error: "Proveedor no encontrado." };

  const adapter = getAdapter(provider.integration_slug);
  if (!adapter) {
    return { error: "Este proveedor todavía no tiene un conector asignado. Selecciona uno en 'Conector' o pide que se implemente el de este proveedor." };
  }

  const { data: creds } = await supabase.from("provider_credentials").select("*").eq("provider_id", providerId).maybeSingle();

  const result = await adapter.testConnection({
    baseUrl: provider.api_base_url ?? "",
    apiKey: creds?.api_key,
    apiSecret: creds?.api_secret,
  });

  return result.ok ? { ok: true, message: result.message } : { error: result.message };
}

export async function sincronizarProveedor(providerId: string) {
  const userId = await requireSuperAdmin();
  const supabase = await createClient();

  const { data: provider } = await supabase.from("providers").select("*").eq("id", providerId).single();
  if (!provider) return { error: "Proveedor no encontrado." };

  const adapter = getAdapter(provider.integration_slug);
  if (!adapter) {
    return { error: "Este proveedor todavía no tiene un conector asignado." };
  }

  const { data: creds } = await supabase.from("provider_credentials").select("*").eq("provider_id", providerId).maybeSingle();
  const startedAt = new Date().toISOString();

  let fetched: Awaited<ReturnType<typeof adapter.fetchInventory>> = [];
  try {
    fetched = await adapter.fetchInventory({
      baseUrl: provider.api_base_url ?? "",
      apiKey: creds?.api_key,
      apiSecret: creds?.api_secret,
    });
  } catch (e) {
    await supabase.from("sync_logs").insert({
      provider_id: providerId,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: "error",
      message: e instanceof Error ? e.message : "Error desconocido al consultar la API del proveedor.",
      triggered_by: userId,
    });
    await supabase.from("providers").update({
      last_synced_at: new Date().toISOString(),
      last_sync_status: "error",
      last_sync_message: "Error al consultar la API.",
    }).eq("id", providerId);
    return { error: "No se pudo consultar la API del proveedor. Revisa la bitácora para el detalle." };
  }

  let updated = 0;
  let unmatched = 0;

  for (const record of fetched) {
    const { data: simCard } = await supabase.from("sim_cards").select("id").eq("icc", record.icc).maybeSingle();
    if (!simCard) {
      unmatched++;
      continue;
    }

    const estadoMapeado = mapEstadoGenerico(record.estado_proveedor);
    if (estadoMapeado) {
      const { data: statusActual } = await supabase
        .from("sim_status_history")
        .select("estado")
        .eq("sim_id", simCard.id)
        .order("changed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!statusActual || statusActual.estado !== estadoMapeado) {
        await supabase.from("sim_status_history").insert({
          sim_id: simCard.id,
          estado: estadoMapeado,
          changed_by: userId,
          nota: `Sincronizado automáticamente desde ${provider.name} (estado reportado: "${record.estado_proveedor}").`,
        });
        updated++;
      }
    }
  }

  const status = unmatched > 0 && updated === 0 ? "partial" : "success";
  const message = `Se revisaron ${fetched.length} SIM del proveedor. ${updated} actualizada(s), ${unmatched} no encontrada(s) en el inventario de Nettz.`;

  await supabase.from("sync_logs").insert({
    provider_id: providerId,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status,
    records_checked: fetched.length,
    records_updated: updated,
    records_unmatched: unmatched,
    message,
    triggered_by: userId,
  });

  await supabase.from("providers").update({
    last_synced_at: new Date().toISOString(),
    last_sync_status: status,
    last_sync_message: message,
  }).eq("id", providerId);

  revalidatePath("/dashboard/configuracion");
  revalidatePath("/dashboard"); revalidatePath("/dashboard/inventario");
  return { ok: true, message };
}
