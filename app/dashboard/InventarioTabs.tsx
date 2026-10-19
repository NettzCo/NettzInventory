import Link from "next/link";

const TABS = [
  { href: "/dashboard/inventario", label: "Inventario" },
  { href: "/dashboard/buscar", label: "Búsqueda rápida" },
  { href: "/dashboard/nueva", label: "Registrar entrega" },
  { href: "/dashboard/cambio-estado", label: "Gestión de SIMs" },
  { href: "/dashboard/inventario/numeros-disponibles", label: "Números disponibles" },
  { href: "/dashboard/reasignacion-numeros", label: "Reasignar números" },
  { href: "/dashboard/historial-numero", label: "Historial Número Corto" },
];

type TabKey = "inventario" | "buscar" | "nueva" | "cambio-estado" | "numeros-disponibles" | "reasignacion-numeros" | "historial-numero";

export default function InventarioTabs({ activo }: { activo: TabKey }) {
  return (
    <div className="flex gap-1.5 mb-6 p-1.5 rounded-xl w-fit flex-wrap" style={{ background: "var(--bg)" }}>
      {TABS.map((t) => {
        const key = t.href.split("/").pop() as TabKey;
        const active = key === activo;
        return (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-lg px-4 py-2 text-sm font-medium transition"
            style={{
              background: active ? "var(--ink-900)" : "transparent",
              color: active ? "white" : "var(--text-secondary)",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
