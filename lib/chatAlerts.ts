import { createClient } from "@/lib/supabase/server";
import { ChatMessage } from "@/lib/types";

export interface AlertaChat {
  conversacion: string; // "general", el id del otro usuario, o "grupo:<id>"
  esGeneral: boolean;
  esGrupo: boolean;
  nombreOtro: string;
  cantidad: number;
  ultimoMensaje: string;
  ultimaFecha: string;
}

export async function construirAlertasChat(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  organizationId: string
): Promise<AlertaChat[]> {
  const { data: misGruposRows } = await supabase.from("chat_group_members").select("group_id").eq("user_id", userId);
  const idsGrupos = (misGruposRows ?? []).map((g) => g.group_id as string);

  const consultas = [
    supabase
      .from("chat_messages")
      .select("*")
      .eq("organization_id", organizationId)
      .is("recipient_id", null)
      .is("group_id", null)
      .neq("sender_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("chat_messages")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("recipient_id", userId)
      .neq("sender_id", userId)
      .order("created_at", { ascending: false }),
  ];
  if (idsGrupos.length > 0) {
    consultas.push(
      supabase
        .from("chat_messages")
        .select("*")
        .eq("organization_id", organizationId)
        .in("group_id", idsGrupos)
        .neq("sender_id", userId)
        .order("created_at", { ascending: false })
    );
  }

  const [{ data: generales }, { data: directos }, gruposResult] = await Promise.all(consultas);
  const deGrupos = idsGrupos.length > 0 ? (gruposResult as { data: ChatMessage[] | null }).data : [];

  const [{ data: reads }, { data: perfiles }, { data: gruposInfo }] = await Promise.all([
    supabase.from("chat_reads").select("*").eq("user_id", userId),
    supabase.from("profiles").select("id, full_name").eq("organization_id", organizationId),
    idsGrupos.length > 0
      ? supabase.from("chat_groups").select("id, name").in("id", idsGrupos)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const ultimaLectura: Record<string, string> = {};
  for (const r of reads ?? []) ultimaLectura[r.conversation] = r.last_read_at;

  const nombrePorId = new Map((perfiles ?? []).map((p) => [p.id, p.full_name]));
  const nombreGrupoPorId = new Map((gruposInfo ?? []).map((g) => [g.id, g.name]));

  const todos = [...(generales ?? []), ...(directos ?? []), ...(deGrupos ?? [])] as ChatMessage[];

  const grupos: Record<string, ChatMessage[]> = {};
  for (const m of todos) {
    const clave = m.group_id ? `grupo:${m.group_id}` : m.recipient_id === null ? "general" : m.sender_id;
    if (!grupos[clave]) grupos[clave] = [];
    grupos[clave].push(m);
  }

  const alertas: AlertaChat[] = [];
  for (const [conversacion, lista] of Object.entries(grupos)) {
    const desde = ultimaLectura[conversacion];
    const noLeidos = desde ? lista.filter((m) => new Date(m.created_at) > new Date(desde)) : lista;
    if (noLeidos.length === 0) continue;
    noLeidos.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const esGeneral = conversacion === "general";
    const esGrupo = conversacion.startsWith("grupo:");
    const nombreOtro = esGeneral
      ? "Canal general"
      : esGrupo
      ? nombreGrupoPorId.get(conversacion.replace("grupo:", "")) ?? "Grupo"
      : nombrePorId.get(conversacion) ?? "Usuario";

    alertas.push({
      conversacion,
      esGeneral,
      esGrupo,
      nombreOtro,
      cantidad: noLeidos.length,
      ultimoMensaje: noLeidos[0].body,
      ultimaFecha: noLeidos[0].created_at,
    });
  }

  return alertas.sort((a, b) => new Date(b.ultimaFecha).getTime() - new Date(a.ultimaFecha).getTime());
}
