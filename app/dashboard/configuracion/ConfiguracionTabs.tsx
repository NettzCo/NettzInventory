"use client";

import { useState } from "react";
import { Profile, Provider, Apn, RoleRow } from "@/lib/types";
import UsuariosManager from "../usuarios/UsuariosManager";
import ProveedoresManager from "../proveedores/ProveedoresManager";
import ApnsManager from "../apns/ApnsManager";
import RolesManager from "../roles/RolesManager";

type Tab = "usuarios" | "roles" | "proveedores" | "apns";

export default function ConfiguracionTabs({
  usuarios,
  roles,
  proveedores,
  apns,
}: {
  usuarios: Profile[];
  roles: RoleRow[];
  proveedores: Provider[];
  apns: Apn[];
}) {
  const [tab, setTab] = useState<Tab>("usuarios");

  const TABS: { id: Tab; label: string }[] = [
    { id: "usuarios", label: "Usuarios" },
    { id: "roles", label: "Roles" },
    { id: "proveedores", label: "Proveedores" },
    { id: "apns", label: "APN" },
  ];

  return (
    <div>
      <div
        className="flex gap-1.5 mb-6 p-1.5 rounded-xl w-fit"
        style={{ background: "var(--bg)" }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="rounded-lg px-4 py-2 text-sm font-medium transition"
            style={{
              background: tab === t.id ? "var(--ink-900)" : "transparent",
              color: tab === t.id ? "white" : "var(--text-secondary)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "usuarios" && <UsuariosManager usuarios={usuarios} roles={roles} />}
      {tab === "roles" && <RolesManager roles={roles} />}
      {tab === "proveedores" && <ProveedoresManager proveedores={proveedores} />}
      {tab === "apns" && <ApnsManager apns={apns} />}
    </div>
  );
}
