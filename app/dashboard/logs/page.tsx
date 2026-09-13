import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { construirFeedLogs } from "@/lib/auditFeed";
import LogsManager from "./LogsManager";

export default async function LogsPage() {
  const { profile } = await getCurrentProfile();
  if (!profile.role_es_sistema) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const [eventos, { data: usuarios }] = await Promise.all([
    construirFeedLogs(supabase, profile.organization_id),
    supabase.from("profiles").select("id, full_name").eq("organization_id", profile.organization_id),
  ]);

  const nombrePorId: Record<string, string> = {};
  for (const u of usuarios ?? []) nombrePorId[u.id] = u.full_name;

  return (
    <main className="p-8">
      <h1 className="font-display text-2xl font-semibold mb-1">Registro de actividad</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
        Todo lo que ha pasado en la plataforma, y quién lo hizo. Solo visible para el super administrador.
      </p>
      <LogsManager eventos={eventos} nombrePorId={nombrePorId} />
    </main>
  );
}
