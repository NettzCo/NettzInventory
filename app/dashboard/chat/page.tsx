import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { tieneModulo } from "@/lib/modules";
import { redirect } from "next/navigation";
import ChatWindow from "./ChatWindow";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ con?: string }>;
}) {
  const { con } = await searchParams;
  const { userId, profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "chat")) redirect("/dashboard");

  const supabase = await createClient();
  const { data: contactos } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("organization_id", profile.organization_id)
    .eq("active", true)
    .neq("id", userId)
    .order("full_name");

  // El super administrador ve y administra TODOS los grupos de la
  // organización; cualquier otro usuario solo ve los grupos a los que
  // pertenece (para poder chatear ahí).
  let grupos: { id: string; name: string }[] = [];
  if (profile.role_es_sistema) {
    const { data } = await supabase
      .from("chat_groups")
      .select("id, name")
      .eq("organization_id", profile.organization_id)
      .order("name");
    grupos = data ?? [];
  } else {
    const { data } = await supabase
      .from("chat_group_members")
      .select("group_id, chat_groups(id, name)")
      .eq("user_id", userId);
    grupos = (data ?? [])
      .map((r) => r.chat_groups as unknown as { id: string; name: string } | null)
      .filter((g): g is { id: string; name: string } => g !== null);
  }

  // Para el super administrador: quiénes son miembros de cada grupo, para
  // poder prellenar el formulario al editar.
  const miembrosPorGrupo: Record<string, string[]> = {};
  if (profile.role_es_sistema && grupos.length > 0) {
    const { data: miembrosRows } = await supabase
      .from("chat_group_members")
      .select("group_id, user_id")
      .in("group_id", grupos.map((g) => g.id));
    for (const m of miembrosRows ?? []) {
      if (!miembrosPorGrupo[m.group_id]) miembrosPorGrupo[m.group_id] = [];
      miembrosPorGrupo[m.group_id].push(m.user_id);
    }
  }

  const todosUsuarios = [{ id: userId, full_name: profile.full_name }, ...(contactos ?? [])];

  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-semibold mb-1">Chat</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Habla con todo tu equipo en el canal general, en un grupo, o en directo con una persona.
        Nada se borra.
      </p>
      <ChatWindow
        currentUserId={userId}
        organizationId={profile.organization_id}
        contactos={contactos ?? []}
        todosUsuarios={todosUsuarios}
        grupos={grupos}
        miembrosPorGrupo={miembrosPorGrupo}
        esSuperAdmin={profile.role_es_sistema}
        conversacionInicial={con}
      />
    </main>
  );
}
