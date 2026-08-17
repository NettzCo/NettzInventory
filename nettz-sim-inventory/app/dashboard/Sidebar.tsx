"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND } from "@/lib/branding";
import { tieneModulo, ModuloKey } from "@/lib/modules";
import { logout } from "./actions";

const NAV_ITEMS: { key: ModuloKey; href: string; label: string; icon: () => React.ReactElement }[] = [
  { key: "inventario", href: "/dashboard", label: "Inventario", icon: InventoryIcon },
  { key: "buscar", href: "/dashboard/buscar", label: "Búsqueda rápida", icon: SearchIcon },
  { key: "alertas", href: "/dashboard/alertas", label: "Alertas", icon: AlertIcon },
  { key: "nueva", href: "/dashboard/nueva", label: "Registrar entrega", icon: PlusIcon },
  { key: "clientes", href: "/dashboard/clientes", label: "Clientes", icon: ClientesIcon },
  { key: "chat", href: "/dashboard/chat", label: "Chat", icon: ChatIcon },
];

export default function Sidebar({
  fullName,
  roleNombre,
  esSuperAdmin,
  puedeGestionarOrganizaciones,
  modulos,
  alertCount,
  orgNombre,
  orgLogoUrl,
}: {
  fullName: string;
  roleNombre: string;
  esSuperAdmin: boolean;
  puedeGestionarOrganizaciones: boolean;
  modulos: string[];
  alertCount: number;
  orgNombre: string;
  orgLogoUrl: string | null;
}) {
  const pathname = usePathname();

  const items = NAV_ITEMS.filter((item) => tieneModulo({ role_es_sistema: esSuperAdmin, modulos }, item.key));
  if (esSuperAdmin) {
    items.push({ key: "configuracion" as ModuloKey, href: "/dashboard/configuracion", label: "Configuración", icon: SettingsIcon });
  }
  if (puedeGestionarOrganizaciones) {
    items.push({ key: "organizaciones" as ModuloKey, href: "/dashboard/organizaciones", label: "Organizaciones", icon: OrgIcon });
  }

  return (
    <aside
      className="w-64 flex-shrink-0 h-screen sticky top-0 flex flex-col text-white"
      style={{ background: "var(--ink-900)" }}
    >
      <div className="px-6 pt-7 pb-8">
        {/* eslint-disable-next-line @next/next/no-img-element -- el logo viene de Supabase Storage (dominio externo, dinámico por organización) */}
        <img
          src={orgLogoUrl || BRAND.logoFull}
          alt={orgNombre}
          style={{ width: "auto", height: "44px", maxWidth: "200px" }}
        />
      </div>

      <nav className="flex-1 flex flex-col gap-1 px-3">
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition"
              style={{
                background: active ? "var(--ink-800)" : "transparent",
                color: active ? "#fff" : "var(--ink-100)",
              }}
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
          <button
            type="submit"
            className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition"
            style={{ color: "var(--ink-100)" }}
          >
            Cerrar sesión
          </button>
        </form>
        <p className="text-xs px-3 mt-2" style={{ color: "var(--ink-100)", opacity: 0.4 }}>
          {BRAND.productName} · v{BRAND.productVersion}
        </p>
      </div>
    </aside>
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
function ClientesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="6.5" r="2.8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.5 15c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
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
