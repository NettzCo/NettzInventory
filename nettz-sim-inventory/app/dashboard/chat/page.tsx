import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { tieneModulo } from "@/lib/modules";
import { redirect } from "next/navigation";
import ChatWindow from "./ChatWindow";

export default async function ChatPage() {
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

  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-semibold mb-1">Chat</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Habla con todo tu equipo en el canal general, o en directo con una persona — por ejemplo,
        para pasarle al área técnica los datos de una entrega recién registrada. Nada se borra.
      </p>
      <ChatWindow currentUserId={userId} organizationId={profile.organization_id} contactos={contactos ?? []} />
    </main>
  );
}
