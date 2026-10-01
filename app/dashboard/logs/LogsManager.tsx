"use client";

import { useMemo, useState } from "react";
import { EventoLog } from "@/lib/auditFeed";
import { formatFechaHora } from "@/lib/ui";

export default function LogsManager({
  eventos,
  nombrePorId,
}: {
  eventos: EventoLog[];
  nombrePorId: Record<string, string>;
}) {
  const [usuarioFiltro, setUsuarioFiltro] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const tipos = useMemo(() => Array.from(new Set(eventos.map((e) => e.tipo))).sort(), [eventos]);
  const usuarios = useMemo(
    () => Array.from(new Set(eventos.map((e) => e.usuario_id))).map((id) => ({ id, nombre: nombrePorId[id] ?? "Usuario" })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [eventos, nombrePorId]
  );

  const visibles = eventos.filter((e) => {
    if (usuarioFiltro && e.usuario_id !== usuarioFiltro) return false;
    if (tipoFiltro && e.tipo !== tipoFiltro) return false;
    if (busqueda.trim() && !e.descripcion.toLowerCase().includes(busqueda.trim().toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <select className="input-filter" value={usuarioFiltro} onChange={(e) => setUsuarioFiltro(e.target.value)}>
          <option value="">Todos los usuarios</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>{u.nombre}</option>
          ))}
        </select>

        <select className="input-filter" value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}>
          <option value="">Todos los tipos</option>
          {tipos.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <input
          className="input-filter flex-1 min-w-[16rem]"
          placeholder="Buscar en la descripción…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <section className="rounded-xl border overflow-hidden bg-white" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Fecha</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Usuario</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Tipo</th>
              <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">Descripción</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((e) => (
              <tr key={e.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{formatFechaHora(e.fecha)}</td>
                <td className="px-4 py-3 whitespace-nowrap font-medium">{nombrePorId[e.usuario_id] ?? "Usuario"}</td>
                <td className="px-4 py-3">
                  <span className="status-pill" style={{ background: "#FDF3E4", color: "var(--state-lista)" }}>{e.tipo}</span>
                </td>
                <td className="px-4 py-3">{e.descripcion}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibles.length === 0 && (
          <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No hay actividad que coincida con estos filtros.
          </div>
        )}
      </section>
    </div>
  );
}
