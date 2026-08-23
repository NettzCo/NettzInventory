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
  const archivoInputRef = useRef<HTMLInputElement>(null);
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

  function handleSeleccionArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void enviarArchivo(file);
    e.target.value = ""; // permite adjuntar el mismo archivo dos veces seguidas
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
            ))}
          </div>
        ) : (
          <>
            <button
              onClick={() => setSeleccion("general")}
              className="w-full text-left px-4 py-3 text-sm border-b flex items-center gap-2"
              style={{
                borderColor: "var(--border)",
                background: esGeneral ? "var(--bg)" : "transparent",
                fontWeight: esGeneral ? 600 : 400,
              }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: "var(--chip-gold)" }} />
              Canal general
            </button>

            <div className="px-4 py-2 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Grupos</span>
              {esSuperAdmin && (
                <button onClick={() => setGestionAbierta("nuevo")} className="text-xs font-medium hover:underline cursor-pointer" style={{ color: "var(--chip-gold)" }}>
                  + Nuevo
                </button>
              )}
            </div>
            {grupos.length === 0 && (
              <p className="px-4 py-2 text-xs" style={{ color: "var(--text-muted)" }}>Sin grupos todavía.</p>
            )}
            {grupos.map((g) => (
              <div
                key={g.id}
                className="w-full flex items-center border-b"
                style={{ borderColor: "var(--border)", background: seleccion === `${GRUPO_PREFIJO}${g.id}` ? "var(--bg)" : "transparent" }}
              >
                <button
                  onClick={() => setSeleccion(`${GRUPO_PREFIJO}${g.id}`)}
                  className="flex-1 text-left px-4 py-3 text-sm"
                  style={{ fontWeight: seleccion === `${GRUPO_PREFIJO}${g.id}` ? 600 : 400 }}
                >
                  # {g.name}
                </button>
                {esSuperAdmin && (
                  <button onClick={() => setGestionAbierta(g.id)} className="px-2 text-xs hover:underline cursor-pointer" style={{ color: "var(--text-muted)" }}>
                    Editar
                  </button>
                )}
              </div>
            ))}

            <div className="px-4 py-2 border-b" style={{ borderColor: "var(--border)" }}>
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Directos{contactos.filter((c) => usuariosEnLinea.has(c.id)).length > 0 && ` · ${contactos.filter((c) => usuariosEnLinea.has(c.id)).length} en línea`}
              </span>
            </div>
            {contactos.map((c) => (
              <button
                key={c.id}
                onClick={() => setSeleccion(c.id)}
                className="w-full text-left px-4 py-3 text-sm border-b flex items-center gap-2"
                style={{
                  borderColor: "var(--border)",
                  background: seleccion === c.id ? "var(--bg)" : "transparent",
                  fontWeight: seleccion === c.id ? 600 : 400,
                }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{
                    background: usuariosEnLinea.has(c.id) ? "#3BA55D" : "#D1D0C4",
                    border: usuariosEnLinea.has(c.id) ? "none" : "1px solid #B8B6A6",
                  }}
                  title={usuariosEnLinea.has(c.id) ? "En línea" : "Desconectado"}
                />
                {c.full_name}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Conversación o panel de gestión de grupo */}
      {gestionAbierta ? (
        <GestionGrupo
          grupoId={gestionAbierta === "nuevo" ? null : gestionAbierta}
          nombreInicial={gestionAbierta === "nuevo" ? "" : nombreGrupoPorId.get(gestionAbierta) ?? ""}
          miembrosIniciales={gestionAbierta === "nuevo" ? [] : miembrosPorGrupo[gestionAbierta] ?? []}
          todosUsuarios={todosUsuarios}
          currentUserId={currentUserId}
          onCerrar={() => setGestionAbierta(null)}
          onListo={(idGrupo) => { setGestionAbierta(null); setSeleccion(`${GRUPO_PREFIJO}${idGrupo}`); router.refresh(); }}
          onEliminado={() => { setGestionAbierta(null); setSeleccion("general"); router.refresh(); }}
        />
      ) : (
        <div
          className="flex-1 flex flex-col min-w-0 relative"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {arrastrando && (
            <div
              className="absolute inset-0 z-20 flex items-center justify-center"
              style={{ background: "rgba(36,35,7,0.85)", border: "2px dashed var(--chip-gold)" }}
            >
              <p className="text-white text-sm font-medium">Suelta aquí para adjuntar el archivo</p>
            </div>
          )}
          <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <p className="font-medium text-sm">{tituloConversacion()}</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {esGeneral
                ? "Visible para todos en tu organización"
                : esGrupo
                ? "Visible para los miembros del grupo"
                : usuariosEnLinea.has(seleccion)
                ? <span style={{ color: "#3BA55D" }}>● En línea</span>
                : "Mensaje directo"}
              {" "}· el historial nunca se borra
              {(esGeneral || esGrupo) && " · escribe @ para mencionar a alguien"}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
            {cargando ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Cargando…</p>
            ) : mensajesVisibles.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Todavía no hay mensajes aquí.</p>
            ) : (
              mensajesVisibles.map((m) => {
                const propio = m.sender_id === currentUserId;
                return (
                  <div key={m.id} className={`flex flex-col ${propio ? "items-end" : "items-start"}`}>
                    <div
                      className="rounded-xl px-3.5 py-2 text-sm max-w-md"
                      style={{
                        background: propio ? "var(--ink-900)" : "var(--bg)",
                        color: propio ? "white" : "var(--text-primary)",
                      }}
                    >
                      {m.attachment_url && m.attachment_type === "image" && (
                        <a href={m.attachment_url} target="_blank" rel="noreferrer" className="block">
                          {/* eslint-disable-next-line @next/next/no-img-element -- adjunto subido por el usuario, dominio externo (Supabase Storage) */}
                          <img src={m.attachment_url} alt={m.attachment_name ?? "imagen adjunta"} style={{ maxWidth: "220px", maxHeight: "220px", borderRadius: "0.5rem", display: "block", marginBottom: m.body ? "0.4rem" : 0 }} />
                        </a>
                      )}
                      {m.attachment_url && m.attachment_type === "file" && (
                        <a href={m.attachment_url} target="_blank" rel="noreferrer" className="text-sm underline block" style={{ marginBottom: m.body ? "0.4rem" : 0 }}>📎 {m.attachment_name}</a>
                      )}
                      {m.body && renderBody(m.body)}
                    </div>
                    <span className="text-xs mt-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                      {nombreDe(m.sender_id)} · {new Date(m.created_at).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {propio && esDirecto && (
                        <span
                          title={otroLeidoHasta && new Date(otroLeidoHasta) >= new Date(m.created_at) ? "Leído" : "Enviado"}
                          style={{ color: otroLeidoHasta && new Date(otroLeidoHasta) >= new Date(m.created_at) ? "var(--chip-gold)" : "var(--text-muted)" }}
                        >
                          {otroLeidoHasta && new Date(otroLeidoHasta) >= new Date(m.created_at) ? "✓✓" : "✓"}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSubmit} className="p-4 border-t flex gap-3 relative" style={{ borderColor: "var(--border)" }}>
            {(subiendoAdjunto || errorAdjunto) && (
              <div
                className="absolute rounded-lg border bg-white px-3 py-2 text-xs shadow-lg"
                style={{ borderColor: "var(--border)", bottom: "calc(100% + 4px)", left: "1rem", color: errorAdjunto ? "var(--state-desactivada)" : "var(--text-secondary)" }}
              >
                {subiendoAdjunto ? "Subiendo archivo…" : errorAdjunto}
              </div>
            )}
            {sugerencias.length > 0 && (
              <div
                className="absolute rounded-lg border bg-white shadow-lg overflow-hidden z-10"
                style={{ borderColor: "var(--border)", bottom: "calc(100% + 4px)", left: "1rem", minWidth: "12rem" }}
              >
                {sugerencias.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => elegirMencion(c)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg)]"
                  >
                    {c.full_name}
                  </button>
                ))}
              </div>
            )}
            <input
              ref={archivoInputRef}
              type="file"
              onChange={handleSeleccionArchivo}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => archivoInputRef.current?.click()}
              disabled={subiendoAdjunto}
              title="Adjuntar un archivo"
              className="rounded-lg border px-3 py-2.5 text-sm disabled:opacity-60 hover:bg-[var(--bg)] cursor-pointer"
              style={{ borderColor: "var(--border)" }}
            >
              📎
            </button>
            <input
              ref={inputRef}
              value={texto}
              onChange={handleTextoChange}
              placeholder={esDirecto ? `Escribe a ${nombrePorId.get(seleccion) ?? "este usuario"}…` : "Escribe un mensaje… (usa @ para mencionar)"}
              className="flex-1 rounded-lg border px-3.5 py-2.5 text-sm outline-none"
              style={{ borderColor: "var(--border)" }}
            />
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 hover:underline cursor-pointer"
              style={{ background: "var(--ink-900)" }}
            >
              Enviar
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function GestionGrupo({
  grupoId,
  nombreInicial,
  miembrosIniciales,
  todosUsuarios,
  currentUserId,
  onCerrar,
  onListo,
  onEliminado,
}: {
  grupoId: string | null;
  nombreInicial: string;
  miembrosIniciales: string[];
  todosUsuarios: Contacto[];
  currentUserId: string;
  onCerrar: () => void;
  onListo: (idGrupo: string) => void;
  onEliminado: () => void;
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [miembros, setMiembros] = useState<string[]>(miembrosIniciales);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleMiembro(id: string) {
    setMiembros((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  function guardar() {
    setError(null);
    startTransition(async () => {
      if (grupoId) {
        const res = await editarGrupo(grupoId, nombre, miembros);
        if (res?.error) { setError(res.error); return; }
        onListo(grupoId);
      } else {
        const res = await crearGrupo(nombre, miembros);
        if (res?.error) { setError(res.error); return; }
        onListo(res.id as string);
      }
    });
  }

  function eliminar() {
    if (!grupoId) return;
    if (!confirm(`¿Eliminar el grupo "${nombreInicial}"? El historial de mensajes de este grupo se pierde.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await eliminarGrupo(grupoId);
      if (res?.error) { setError(res.error); return; }
      onEliminado();
    });
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 p-6 overflow-y-auto">
      <h2 className="font-display text-lg font-semibold mb-1">{grupoId ? "Editar grupo" : "Nuevo grupo"}</h2>
      <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
        Ponle un nombre y elige quiénes pertenecen a este grupo.
      </p>

      <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Nombre del grupo</label>
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Ej: Soporte técnico"
        className="rounded-lg border px-3.5 py-2.5 text-sm outline-none mb-4 max-w-sm"
        style={{ borderColor: "var(--border)" }}
      />

      <label className="text-xs font-medium block mb-2" style={{ color: "var(--text-secondary)" }}>Miembros</label>
      <div className="flex flex-col gap-1.5 mb-4 max-w-sm">
        {todosUsuarios.map((u) => (
          <label key={u.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={miembros.includes(u.id)} onChange={() => toggleMiembro(u.id)} />
            {u.full_name} {u.id === currentUserId && "(tú)"}
          </label>
        ))}
      </div>

      {error && <p className="text-sm mb-3" style={{ color: "var(--state-desactivada)" }}>{error}</p>}

      <div className="flex gap-3">
        <button onClick={guardar} disabled={isPending} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 hover:underline cursor-pointer" style={{ background: "var(--ink-900)" }}>
          {isPending ? "Guardando…" : "Guardar"}
        </button>
        <button onClick={onCerrar} disabled={isPending} className="rounded-lg border px-4 py-2 text-sm font-medium hover:underline cursor-pointer" style={{ borderColor: "var(--border)" }}>
          Cancelar
        </button>
        {grupoId && (
          <button onClick={eliminar} disabled={isPending} className="rounded-lg border px-4 py-2 text-sm font-medium hover:underline cursor-pointer" style={{ borderColor: "var(--border)", color: "var(--state-desactivada)" }}>
            Eliminar grupo
          </button>
        )}
      </div>
    </div>
  );
}
