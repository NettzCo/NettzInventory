import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { contarAlertasActivas } from "@/lib/alerts";
import { construirAlertasChat } from "@/lib/chatAlerts";
import { SimCurrentView } from "@/lib/types";
import { derivarPaleta } from "@/lib/colorUtils";
import Sidebar from "./Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, profile } = await getCurrentProfile();

  const supabase = await createClient();
  const [{ data: sims }, alertasChat] = await Promise.all([
    supabase.from("sim_current_view").select("*"),
    construirAlertasChat(supabase, userId, profile.organization_id),
  ]);
  const alertCount = contarAlertasActivas((sims ?? []) as SimCurrentView[]) + alertasChat.length;

  // Cada organización tiene sus propios 2 colores (Configuración →
  // Organizaciones, solo visible para el dueño de la plataforma). Acá se
  // deriva toda la paleta y se sobreescriben las variables CSS para que
  // toda la interfaz adopte automáticamente esa marca.
  const paleta = derivarPaleta(profile.org_color_ink, profile.org_color_accent);

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
      <style>{`
        :root {
          --ink-950: ${paleta.ink950};
          --ink-900: ${paleta.ink900};
          --ink-800: ${paleta.ink800};
          --ink-700: ${paleta.ink700};
          --ink-100: ${paleta.ink100};
          --chip-gold: ${paleta.chipGold};
          --chip-gold-soft: ${paleta.chipGoldSoft};
        }
      `}</style>
      <Sidebar
        fullName={profile.full_name}
        roleNombre={profile.role_nombre}
        esSuperAdmin={profile.role_es_sistema}
        puedeGestionarOrganizaciones={profile.puede_gestionar_organizaciones}
        modulos={profile.modulos}
        alertCount={alertCount}
        orgNombre={profile.org_nombre}
        orgLogoUrl={profile.org_logo_url}
        organizationId={profile.organization_id}
        currentUserId={userId}
      />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
