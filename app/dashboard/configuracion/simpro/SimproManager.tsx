"use client";

import { useState, useTransition } from "react";
import { sincronizarSimproManual, obtenerHistorialSimpro, SimproSyncRunRow } from "./actions";
import { ResultadoSincronizacion } from "@/lib/integrations/simpro/sync";

export default function SimproManager({ historialInicial }: { historialInicial: SimproSyncRunRow[] }) {
  const [historial, setHistorial] = useState(historialInicial);
  const [resultado, setResultado] = useState<ResultadoSincronizacion | null>(null);
  const [limitePrueba, setLimitePrueba] = useState(30);
  const [isPending, startTransition] = useTransition();

  function sincronizar(limite?: number) {
    setResultado(null);
    startTransition(async () => {
      const res = await sincronizarSimproManual(limite);
      setResultado(res);
      const nuevo = await obtenerHistorialSimpro();
      setHistorial(nuevo);
    });
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="rounded-xl border bg-white p-5" style={{ borderColor: "var(--border)" }}>
        <h3 className="text-base font-semibold mb-1">SIMPro (Wireless Logic)</h3>
        <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
          Trae el inventario completo desde SIMPro y lo refleja en Nettz: ICC, número (MSISDN), cliente
          (tomado del &quot;grupo de SIM&quot; en SIMPro), fecha de activación, estado y proveedor real. Si el
          nombre del grupo ya coincide con un cliente existente en Nettz, la SIM se asigna a ese mismo
          cliente — así un cliente puede tener SIM de Wireless Logic y de otros proveedores a la vez.
        </p>

        <div className="rounded-lg px-3 py-2.5 text-sm mb-4" style={{ background: "var(--bg)" }}>
          <p className="font-medium mb-1">Variables de entorno necesarias (en Vercel)</p>
          <ul className="list-disc list-inside" style={{ color: "var(--text-secondary)" }}>
            <li><code>SIMPRO_API_CLIENT</code> y <code>SIMPRO_API_KEY</code> — credenciales dadas por Wireless Logic.</li>
            <li><code>CRON_SECRET</code>, <code>SIMPRO_ORGANIZATION_ID</code> y <code>SIMPRO_SYNC_USER_ID</code> — solo si quieres la sincronización automática cada hora (ver <code>vercel.json</code>). En el plan gratuito de Vercel, los Cron Jobs corren como máximo una vez al día — para cada hora hace falta el plan Pro.</li>
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-2">
          <div className="flex items-center gap-2 rounded-lg border-2 px-3 py-2" style={{ borderColor: "var(--state-lista)" }}>
            <label className="text-sm font-medium" style={{ color: "var(--state-lista)" }}>Probar con</label>
            <input
              type="number"
              min={1}
              max={500}
              value={limitePrueba}
              onChange={(e) => setLimitePrueba(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 text-center rounded border px-1 py-1 text-sm"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
            />
            <button
              onClick={() => sincronizar(limitePrueba)}
              disabled={isPending}
              className="text-sm font-semibold disabled:opacity-60"
              style={{ color: "var(--state-lista)" }}
            >
              {isPending ? "Sincronizando…" : "SIM →"}
            </button>
          </div>

          <button
            onClick={() => sincronizar(undefined)}
            disabled={isPending}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--ink-900)" }}
          >
            {isPending ? "Sincronizando…" : "Sincronizar todo el inventario"}
          </button>
        </div>
        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
          Recomendado: primero prueba con pocas SIM, revisa el resultado (sobre todo los estados sin
          mapear) y ajusta lo que haga falta antes de traer el inventario completo.
        </p>

        {resultado && (
          <div className="mt-4">
            {resultado.ok && resultado.resumen ? (
              <div className="rounded-lg px-3 py-2.5 text-sm" style={{ background: "#E7F5EC", color: "var(--state-activa)" }}>
                {resultado.resumen.creadas} creada(s) · {resultado.resumen.actualizadas} actualizada(s) · {resultado.resumen.sinCambios} sin cambios
                {resultado.resumen.errores > 0 && ` · ${resultado.resumen.errores} con error`}
                {resultado.resumen.estadosSinMapear.length > 0 && (
                  <p className="mt-1" style={{ color: "var(--state-lista)" }}>
                    ⚠ Estados de SIMPro sin mapear todavía: {resultado.resumen.estadosSinMapear.join(", ")}.
                    Esas SIM quedaron como &quot;Inactiva&quot; — agrega estos valores en <code>lib/integrations/simpro/estadoMapping.ts</code>.
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-lg px-3 py-2.5 text-sm" style={{ background: "#FDEAEA", color: "var(--state-desactivada)" }}>
                {resultado.errorGeneral}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <h3 className="text-base font-semibold px-5 pt-5 pb-3">Historial de sincronizaciones</h3>
        {historial.length === 0 ? (
          <p className="px-5 pb-5 text-sm" style={{ color: "var(--text-muted)" }}>Todavía no se ha corrido ninguna sincronización.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                <th className="px-5 py-2 font-medium text-xs uppercase">Fecha</th>
                <th className="px-4 py-2 font-medium text-xs uppercase">Origen</th>
                <th className="px-4 py-2 font-medium text-xs uppercase">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((h) => (
                <tr key={h.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="px-5 py-2.5">{new Date(h.started_at).toLocaleString("es-CO")}</td>
                  <td className="px-4 py-2.5">{h.disparado_por === "cron" ? "Automática" : "Manual"}</td>
                  <td className="px-4 py-2.5">
                    {h.error_general ? (
                      <span style={{ color: "var(--state-desactivada)" }}>{h.error_general}</span>
                    ) : !h.finished_at ? (
                      <span style={{ color: "var(--text-muted)" }}>En curso…</span>
                    ) : (
                      <>
                        {h.creadas} creada(s) · {h.actualizadas} actualizada(s) · {h.sin_cambios} sin cambios
                        {h.errores > 0 && ` · ${h.errores} con error`}
                        {h.estados_sin_mapear?.length > 0 && (
                          <span style={{ color: "var(--state-lista)" }}> · sin mapear: {h.estados_sin_mapear.join(", ")}</span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
