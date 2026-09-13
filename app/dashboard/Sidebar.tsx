"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND } from "@/lib/branding";
import { tieneModulo, ModuloKey } from "@/lib/modules";
import { createClient } from "@/lib/supabase/client";
import { obtenerConteoAlertas } from "./alertas/liveActions";
import { logout } from "./actions";

const NAV_ITEMS: { key: ModuloKey; href: string; label: string; icon: () => React.ReactElement }[] = [
  { key: "inventario", href: "/dashboard/inventario", label: "Inventario", icon: InventoryIcon },
  { key: "alertas", href: "/dashboard/alertas", label: "Alertas", icon: AlertIcon },
  { key: "clientes", href: "/dashboard/clientes", label: "Clientes", icon: ClientesIcon },
  { key: "pedidos", href: "/dashboard/pedidos", label: "Pedidos", icon: PedidosIcon },
  { key: "chat", href: "/dashboard/chat", label: "Chat", icon: ChatIcon },
  { key: "reportes", href: "/dashboard/reportes", label: "Reportes", icon: ReportesIcon },
];

export default function Sidebar({
  fullName,
  roleNombre,
  esSuperAdmin,
  puedeGestionarOrganizaciones,
  modulos,
  alertCount: alertCountInicial,
  orgNombre,
  orgLogoUrl,
  organizationId,
  currentUserId,
}: {
  fullName: string;
  roleNombre: string;
  esSuperAdmin: boolean;
  puedeGestionarOrganizaciones: boolean;
  modulos: string[];
  alertCount: number;
  orgNombre: string;
  orgLogoUrl: string | null;
  organizationId: string;
  currentUserId: string;
}) {
  const pathname = usePathname();
  const [alertCount, setAlertCount] = useState(alertCountInicial);
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);

  // Si el layout recalcula el conteo del lado del servidor (por ejemplo,
  // tras un router.refresh() tras marcar una alerta como vista o cambiar el
  // estado de una SIM) y vuelve a renderizar este componente con un valor
  // distinto, el estado local se sincroniza con el nuevo valor recibido.
  useEffect(() => {
    setAlertCount(alertCountInicial);
  }, [alertCountInicial]);

  // Escucha en tiempo real: cualquier mensaje de chat nuevo en la organización,
  // cualquier cambio en "hasta dónde leíste" (propio, puede venir de otra
  // pestaña o del mismo chat), cualquier pedido, cualquier alerta de
  // vencimiento marcada como vista, o cualquier cambio de estado de una SIM
  // (una SIM que vence, se renueva o se desactiva) recalcula la campanita al
  // instante — sin necesidad de recargar la página ni cambiar de módulo.
  useEffect(() => {
    const supabase = createClient();

    async function refrescar() {
      const nuevo = await obtenerConteoAlertas();
      setAlertCount(nuevo);
    }

    const canal = supabase
      .channel(`alertas-badge-${organizationId}-${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `organization_id=eq.${organizationId}` },
        () => { void refrescar(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_reads", filter: `user_id=eq.${currentUserId}` },
        () => { void refrescar(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos", filter: `organization_id=eq.${organizationId}` },
        () => { void refrescar(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sim_alert_reads", filter: `user_id=eq.${currentUserId}` },
        () => { void refrescar(); }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sim_status_history" },
        () => { void refrescar(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, [organizationId, currentUserId]);

  const items = [
    { key: "inicio" as ModuloKey, href: "/dashboard", label: "Inicio", icon: HomeIcon },
    ...NAV_ITEMS.filter((item) => tieneModulo({ role_es_sistema: esSuperAdmin, modulos }, item.key)),
  ];
  if (esSuperAdmin) {
    items.push({ key: "configuracion" as ModuloKey, href: "/dashboard/configuracion", label: "Configuración", icon: SettingsIcon });
    items.push({ key: "logs" as ModuloKey, href: "/dashboard/logs", label: "Logs", icon: LogsIcon });
  }
  if (puedeGestionarOrganizaciones) {
    items.push({ key: "organizaciones" as ModuloKey, href: "/dashboard/organizaciones", label: "Organizaciones", icon: OrgIcon });
  }

  useEffect(() => {
    setMenuMovilAbierto(false);
  }, [pathname]);

  return (
    <>
      {/* Barra superior — solo en móvil, siempre visible sin importar el cajón */}
      <div
        className="md:hidden flex items-center justify-between px-4 py-3 text-white sticky top-0 z-30"
        style={{ background: "var(--ink-900)" }}
      >
        <button onClick={() => setMenuMovilAbierto(true)} aria-label="Abrir menú" className="p-1">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element -- el logo viene de Supabase Storage (dominio externo, dinámico por organización) */}
        <img src={orgLogoUrl || BRAND.logoFull} alt={orgNombre} style={{ height: "28px", width: "auto", maxWidth: "140px" }} />
        <span style={{ width: "22px" }} />
      </div>

      {/* Fondo oscuro tras el cajón, solo en móvil mientras está abierto */}
      {menuMovilAbierto && (
        <div
          className="md:hidden fixed inset-0 z-40"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setMenuMovilAbierto(false)}
        />
      )}

      <aside
        className={`w-64 flex-shrink-0 h-screen flex flex-col text-white fixed inset-y-0 left-0 z-50 transition-transform duration-200 md:sticky md:top-0 md:translate-x-0 ${
          menuMovilAbierto ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ background: "var(--ink-900)" }}
      >
        <div className="px-6 pt-7 pb-8 hidden md:block">
          {/* eslint-disable-next-line @next/next/no-img-element -- el logo viene de Supabase Storage (dominio externo, dinámico por organización) */}
          <img
            src={orgLogoUrl || BRAND.logoFull}
            alt={orgNombre}
            style={{ width: "auto", height: "44px", maxWidth: "200px" }}
          />
        </div>

        <nav className="flex-1 flex flex-col gap-1 px-3 pt-4 md:pt-0 overflow-y-auto">
          {items.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link${active ? " active" : ""}`}
              >
                <Icon />
                <span className="flex-1">{item.label}</span>
                {item.href === "/dashboard/alertas" && alertCount > 0 && (
                  <span
                    className="text-xs font-semibold rounded-full px-2 py-0.5"
                    style={{ background: "var(--chip-gold)", color: "var(--ink-950)" }}
                  >
                    {alertCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pb-4 pt-3 border-t" style={{ borderColor: "var(--ink-700)" }}>
          <div className="px-3 pb-3">
            <p className="text-sm font-medium truncate">{fullName}</p>
            <p className="text-xs" style={{ color: "var(--ink-100)", opacity: 0.6 }}>
              {roleNombre}
            </p>
          </div>
          <form action={logout}>
            <button type="submit" className="signout-link">
              Cerrar sesión
            </button>
          </form>
          <p className="text-xs px-3 mt-2" style={{ color: "var(--ink-100)", opacity: 0.4 }}>
            {BRAND.productName} · v{BRAND.productVersion}
          </p>
        </div>
      </aside>
    </>
  );
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M2.5 8.5 9 3l6.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 7.5V14a1 1 0 0 0 1 1h2.5v-3.5h3V15H14a1 1 0 0 0 1-1V7.5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
function InventoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 6.5h4M5.5 9h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12 12l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2.5c-2.2 0-3.6 1.8-3.6 4v2c0 1-.4 1.9-1.1 2.6l-.5.5c-.4.4-.1 1.1.5 1.1h9.4c.6 0 .9-.7.5-1.1l-.5-.5c-.7-.7-1.1-1.6-1.1-2.6v-2c0-2.2-1.4-4-3.6-4Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M7.3 14.8a1.9 1.9 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function PedidosIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M2.5 5.5 9 2l6.5 3.5v7L9 16l-6.5-3.5v-7Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M2.5 5.5 9 9l6.5-3.5M9 9v7" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
function ClientesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="6.5" r="2.8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.5 15c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function ReportesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3 3v12h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 12.5v-4M9 12.5v-6M12.5 12.5v-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function LogsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M4 3h10v12H4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6.5 6.5h5M6.5 9h5M6.5 11.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 2.6v2M9 13.4v2M2.6 9h2M13.4 9h2M4.4 4.4l1.4 1.4M12.2 12.2l1.4 1.4M4.4 13.6l1.4-1.4M12.2 5.8l1.4-1.4"
        stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M2.5 4.5c0-1.1.9-2 2-2h9c1.1 0 2 .9 2 2v6c0 1.1-.9 2-2 2H7l-3.2 2.6c-.4.3-.9 0-.9-.5v-2.1H4.5c-1.1 0-2-.9-2-2v-6Z"
        stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
function OrgIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2.5" y="7.5" width="5" height="7.5" stroke="currentColor" strokeWidth="1.3" />
      <rect x="10.5" y="3.5" width="5" height="11.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.5 10h1M4.5 12.5h1M12.5 6h1M12.5 8.5h1M12.5 11h1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
