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

// Tope de seguridad: no hace falta mirar más atrás de esto para contar no
// leídos (si alguien no entra al chat en 90 días, igual se le muestra que
// tiene pendientes, solo que el conteo exacto se limita a esta ventana).
const DIAS_TOPE_SIN_LEER = 90;

export async function construirAlertasChat(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  organizationId: string
): Promise<AlertaChat[]> {
  // IMPORTANTE para el rendimiento: esta función corre en CADA navegación
  // (vive en el layout compartido del dashboard). Antes traía TODO el
  // historial completo de mensajes (canal general + cada directo + cada
  // grupo) sin límite, cada vez — con meses de chat acumulado, eso hacía
  // cada clic cada vez más lento. Ahora se acota a mensajes recientes
  // (desde la lectura más vieja registrada, o un tope de 90 días si nunca
  // se ha leído nada) y con un límite duro de filas, usando solo las
  // columnas que realmente hacen falta.
  const [{ data: misGruposRows }, { data: reads }] = await Promise.all([
    supabase.from("chat_group_members").select("group_id").eq("user_id", userId),
    supabase.from("chat_reads").select("*").eq("user_id", userId),
  ]);
  const idsGrupos = (misGruposRows ?? []).map((g) => g.group_id as string);

  const lecturas = (reads ?? []).map((r) => r.last_read_at as string);
  const topeFallback = new Date(Date.now() - DIAS_TOPE_SIN_LEER * 24 * 60 * 60 * 1000).toISOString();
  const fechaCorte = lecturas.length > 0 ? lecturas.reduce((min, d) => (d < min ? d : min), lecturas[0]) : topeFallback;

  const COLUMNAS = "id, sender_id, recipient_id, group_id, body, created_at";
  const LIMITE_POR_CONVERSACION = 300; // tope duro, por si alguna conversación igual tiene muchísimos mensajes recientes

  const consultas = [
    supabase
      .from("chat_messages")
      .select(COLUMNAS)
      .eq("organization_id", organizationId)
      .is("recipient_id", null)
      .is("group_id", null)
      .neq("sender_id", userId)
      .gte("created_at", fechaCorte)
      .order("created_at", { ascending: false })
      .limit(LIMITE_POR_CONVERSACION),
    supabase
      .from("chat_messages")
      .select(COLUMNAS)
      .eq("organization_id", organizationId)
      .eq("recipient_id", userId)
      .neq("sender_id", userId)
      .gte("created_at", fechaCorte)
      .order("created_at", { ascending: false })
      .limit(LIMITE_POR_CONVERSACION),
  ];
  if (idsGrupos.length > 0) {
    consultas.push(
      supabase
        .from("chat_messages")
        .select(COLUMNAS)
        .eq("organization_id", organizationId)
        .in("group_id", idsGrupos)
        .neq("sender_id", userId)
        .gte("created_at", fechaCorte)
        .order("created_at", { ascending: false })
        .limit(LIMITE_POR_CONVERSACION)
    );
  }

  const [{ data: generales }, { data: directos }, gruposResult] = await Promise.all(consultas);
  const deGrupos = idsGrupos.length > 0 ? (gruposResult as { data: ChatMessage[] | null }).data : [];

  const [{ data: perfiles }, { data: gruposInfo }] = await Promise.all([
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
