"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ChatMessage } from "@/lib/types";
import { enviarMensaje, marcarChatLeido, crearGrupo, editarGrupo, eliminarGrupo, subirAdjuntoChat, buscarMensajesChat, AdjuntoChat } from "./actions";

interface Contacto {
  id: string;
  full_name: string;
}
interface Grupo {
  id: string;
  name: string;
}

function tokenDeNombre(nombre: string): string {
  return nombre.replace(/\s+/g, "");
}
function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const GRUPO_PREFIJO = "grupo:";

export default function ChatWindow({
  currentUserId,
  organizationId,
  contactos,
  todosUsuarios,
  grupos,
  miembrosPorGrupo,
  esSuperAdmin,
  conversacionInicial,
}: {
  currentUserId: string;
  organizationId: string;
  contactos: Contacto[];
  todosUsuarios: Contacto[];
  grupos: Grupo[];
  miembrosPorGrupo: Record<string, string[]>;
  esSuperAdmin: boolean;
  conversacionInicial?: string;
}) {
  const router = useRouter();
  const [seleccion, setSeleccion] = useState<string>(conversacionInicial || "general");
  const [mensajes, setMensajes] = useState<ChatMessage[]>([]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(true);
  const [otroLeidoHasta, setOtroLeidoHasta] = useState<string | null>(null);
  const [mencionActiva, setMencionActiva] = useState<{ inicio: number; filtro: string } | null>(null);
  const [gestionAbierta, setGestionAbierta] = useState<"nuevo" | string | null>(null); // string = id de grupo a editar
  const [usuariosEnLinea, setUsuariosEnLinea] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [arrastrando, setArrastrando] = useState(false);
  const [subiendoAdjunto, setSubiendoAdjunto] = useState(false);
  const [errorAdjunto, setErrorAdjunto] = useState<string | null>(null);
  const [terminoBusqueda, setTerminoBusqueda] = useState("");
  const [resultadosBusqueda, setResultadosBusqueda] = useState<ChatMessage[]>([]);
  const [buscando, setBuscando] = useState(false);
  const dragCounter = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nombrePorId = new Map(contactos.map((c) => [c.id, c.full_name]));
  const nombreGrupoPorId = new Map(grupos.map((g) => [g.id, g.name]));

  const esGeneral = seleccion === "general";
  const esGrupo = seleccion.startsWith(GRUPO_PREFIJO);
  const grupoIdActual = esGrupo ? seleccion.replace(GRUPO_PREFIJO, "") : null;
  const esDirecto = !esGeneral && !esGrupo;

  function nombreDe(id: string) {
    if (id === currentUserId) return "Tú";
    return nombrePorId.get(id) ?? "Usuario";
  }

  function esRelevante(msg: ChatMessage) {
    if (esGeneral) return msg.recipient_id === null && !msg.group_id;
    if (esGrupo) return msg.group_id === grupoIdActual;
    return (
      (msg.sender_id === currentUserId && msg.recipient_id === seleccion) ||
      (msg.sender_id === seleccion && msg.recipient_id === currentUserId)
    );
  }

  useEffect(() => {
    const supabase = createClient();
    let activo = true;

    async function cargar() {
      setCargando(true);
      let query = supabase
        .from("chat_messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(200);

      if (esGeneral) {
        query = query.is("recipient_id", null).is("group_id", null);
      } else if (esGrupo) {
        query = query.eq("group_id", grupoIdActual as string);
      } else {
        query = query.or(
          `and(sender_id.eq.${currentUserId},recipient_id.eq.${seleccion}),and(sender_id.eq.${seleccion},recipient_id.eq.${currentUserId})`
        );
      }

      const { data } = await query;
      if (activo) {
        setMensajes((data ?? []) as ChatMessage[]);
        setCargando(false);
      }
    }
    cargar();

    const canal = supabase
      .channel(`chat-${organizationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `organization_id=eq.${organizationId}` },
        (payload) => {
          const nuevo = payload.new as ChatMessage;
          setMensajes((prev) => [...prev, nuevo]);
        }
      )
      .subscribe();

    return () => {
      activo = false;
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccion, organizationId, currentUserId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  // Marca como leída la conversación abierta (canal, grupo o directo).
  useEffect(() => {
    void marcarChatLeido(seleccion);
  }, [seleccion, mensajes.length]);

  // Doble check: solo aplica en directos — verifica hasta cuándo ha leído
  // el OTRO usuario, y se actualiza al instante si él la marca.
  useEffect(() => {
    if (!esDirecto) { setOtroLeidoHasta(null); return; }
    const supabase = createClient();
    let activo = true;

    async function cargarLectura() {
      const { data } = await supabase
        .from("chat_reads")
        .select("last_read_at")
        .eq("user_id", seleccion)
        .eq("conversation", currentUserId)
        .maybeSingle();
      if (activo) setOtroLeidoHasta(data?.last_read_at ?? null);
    }
    cargarLectura();

    const canal = supabase
      .channel(`lectura-${seleccion}-${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_reads", filter: `user_id=eq.${seleccion}` },
        () => { void cargarLectura(); }
      )
      .subscribe();

    return () => {
      activo = false;
      supabase.removeChannel(canal);
    };
  }, [seleccion, currentUserId, esDirecto]);

  // Si el super administrador crea/edita/elimina un grupo mientras alguien
  // tiene el chat abierto, esto refresca la lista de grupos al instante.
  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel(`grupos-chat-${organizationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_groups", filter: `organization_id=eq.${organizationId}` }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_group_members" }, () => router.refresh())
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, [organizationId, router]);

  // Presencia en línea: cada persona que tiene el chat abierto "avisa" que
  // está conectada, y todos los demás lo ven al instante (punto verde).
  useEffect(() => {
    const supabase = createClient();
    const canal = supabase.channel(`presencia-chat-${organizationId}`, {
      config: { presence: { key: currentUserId } },
    });

    canal
      .on("presence", { event: "sync" }, () => {
        const estado = canal.presenceState();
        setUsuariosEnLinea(new Set(Object.keys(estado)));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await canal.track({ online_at: new Date().toISOString() });
        }
      });

    return () => { supabase.removeChannel(canal); };
  }, [organizationId, currentUserId]);

  const mensajesVisibles = mensajes.filter(esRelevante);

  // Búsqueda dentro de todo el chat (canal general, grupos y directos a
  // los que el usuario tiene acceso) — con una pequeña pausa mientras
  // escribe, para no disparar una búsqueda por cada tecla.
  useEffect(() => {
    if (!terminoBusqueda.trim()) {
      setResultadosBusqueda([]);
      return;
    }
    setBuscando(true);
    const espera = setTimeout(() => {
      buscarMensajesChat(terminoBusqueda).then((res) => {
        setResultadosBusqueda((res.resultados ?? []) as ChatMessage[]);
        setBuscando(false);
      });
    }, 300);
    return () => clearTimeout(espera);
  }, [terminoBusqueda]);

  function etiquetaContexto(m: ChatMessage) {
    if (m.group_id) return `Grupo: ${nombreGrupoPorId.get(m.group_id) ?? "Grupo"}`;
    if (m.recipient_id === null) return "Canal general";
    const otro = m.sender_id === currentUserId ? m.recipient_id : m.sender_id;
    return `Directo: ${nombreDe(otro as string)}`;
  }

  function irAResultado(m: ChatMessage) {
    let destino: string;
    if (m.group_id) destino = `${GRUPO_PREFIJO}${m.group_id}`;
    else if (m.recipient_id === null) destino = "general";
    else destino = m.sender_id === currentUserId ? (m.recipient_id as string) : m.sender_id;

    setSeleccion(destino);
    setTerminoBusqueda("");
    setResultadosBusqueda([]);
  }

  // ---------- Menciones @Nombre ----------
  const contactosOrdenados = useMemo(
    () => [...contactos].sort((a, b) => tokenDeNombre(b.full_name).length - tokenDeNombre(a.full_name).length),
    [contactos]
  );
  const regexMenciones = useMemo(() => {
    if (contactosOrdenados.length === 0) return null;
    const patron = contactosOrdenados.map((c) => escaparRegex(tokenDeNombre(c.full_name))).join("|");
    return new RegExp(`@(${patron})`, "g");
  }, [contactosOrdenados]);

  function renderBody(body: string) {
    if (!regexMenciones) return body;
    const partes = body.split(regexMenciones);
    return partes.map((parte, i) =>
      i % 2 === 1 ? (
        <span key={i} className="font-semibold" style={{ color: "var(--chip-gold)" }}>@{parte}</span>
      ) : (
        parte
      )
    );
  }

  const sugerencias = mencionActiva
    ? contactos.filter((c) => tokenDeNombre(c.full_name).toLowerCase().startsWith(mencionActiva.filtro.toLowerCase())).slice(0, 5)
    : [];

  function handleTextoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const valor = e.target.value;
    const caret = e.target.selectionStart ?? valor.length;
    setTexto(valor);

    const hastaCaret = valor.slice(0, caret);
    const match = hastaCaret.match(/@([^\s@]*)$/);
    if (match) {
      setMencionActiva({ inicio: caret - match[0].length, filtro: match[1] });
    } else {
      setMencionActiva(null);
    }
  }

  function elegirMencion(c: Contacto) {
    if (!mencionActiva) return;
    const token = tokenDeNombre(c.full_name);
    const antes = texto.slice(0, mencionActiva.inicio);
    const despues = texto.slice(mencionActiva.inicio + 1 + mencionActiva.filtro.length);
    setTexto(`${antes}@${token} ${despues}`);
    setMencionActiva(null);
    inputRef.current?.focus();
  }

  async function enviarArchivo(file: File) {
    setErrorAdjunto(null);
    setSubiendoAdjunto(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await subirAdjuntoChat(formData);
    setSubiendoAdjunto(false);

    if (res.error || !res.url || !res.name || !res.type) {
      setErrorAdjunto(res.error ?? "No se pudo subir el archivo.");
      return;
    }
    const adjunto: AdjuntoChat = { url: res.url, name: res.name, type: res.type };

    if (esGrupo) await enviarMensaje(null, "", grupoIdActual, adjunto);
    else if (esGeneral) await enviarMensaje(null, "", null, adjunto);
    else await enviarMensaje(seleccion, "", null, adjunto);
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current += 1;
    setArrastrando(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) setArrastrando(false);
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setArrastrando(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void enviarArchivo(file);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cuerpo = texto.trim();
    if (!cuerpo) return;
    setTexto("");
    setMencionActiva(null);
    startTransition(async () => {
      if (esGrupo) await enviarMensaje(null, cuerpo, grupoIdActual);
      else if (esGeneral) await enviarMensaje(null, cuerpo, null);
      else await enviarMensaje(seleccion, cuerpo, null);
    });
  }

  function tituloConversacion() {
    if (esGeneral) return "Canal general";
    if (esGrupo) return nombreGrupoPorId.get(grupoIdActual as string) ?? "Grupo";
    return nombrePorId.get(seleccion) ?? "Usuario";
  }

  return (
    <div className="flex rounded-xl border bg-white overflow-hidden" style={{ borderColor: "var(--border)", height: "calc(100vh - 180px)" }}>
      {/* Lista de conversaciones */}
      <div className="w-64 flex-shrink-0 border-r overflow-y-auto" style={{ borderColor: "var(--border)" }}>
        <div className="p-3 border-b" style={{ borderColor: "var(--border)" }}>
          <input
            value={terminoBusqueda}
            onChange={(e) => setTerminoBusqueda(e.target.value)}
            placeholder="Buscar en el chat…"
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--border)" }}
          />
        </div>

        {terminoBusqueda.trim() ? (
          <div>
            {buscando && <p className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>Buscando…</p>}
            {!buscando && resultadosBusqueda.length === 0 && (
              <p className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>Sin resultados.</p>
            )}
            {resultadosBusqueda.map((m) => (
              <button
                key={m.id}
                onClick={() => irAResultado(m)}
                className="w-full text-left px-4 py-3 text-sm border-b hover:bg-[var(--bg)]"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="text-xs font-semibold mb-0.5" style={{ color: "var(--chip-gold)" }}>{etiquetaContexto(m)}</div>
                <div className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>
                  {nombreDe(m.sender_id)} · {new Date(m.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                </div>
                <div className="truncate" style={{ maxWidth: "14rem" }}>
                  {m.body || (m.attachment_name ? `📎 ${m.attachment_name}` : "")}
                </div>
              </button>
