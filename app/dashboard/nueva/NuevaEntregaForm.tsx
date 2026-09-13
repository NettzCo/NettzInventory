"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { crearEntrega, SimRowInput } from "./actions";
import { ESTADOS_SIM } from "@/lib/types";
import ClienteAutocomplete, { ClienteOpcion } from "@/components/ClienteAutocomplete";

interface UsuarioOpcion {
  id: string;
  full_name: string;
}

interface OpcionNombre {
  id: string;
  name: string;
}

function nuevaFila(): SimRowInput {
  return { icc: "", proveedor: "", numero_corto: "", estado_entrega: "Inactiva", fecha_activacion: "", apn: "", observaciones: "" };
}

// Suma meses a una fecha (YYYY-MM-DD) sin depender de librerías externas —
// solo para mostrar la vista previa de "fecha fin del plan".
function sumarMeses(fechaStr: string, meses: number): string {
  const [y, m, d] = fechaStr.split("-").map(Number);
  const fecha = new Date(y, m - 1 + meses, d);
  return fecha.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
}

export default function NuevaEntregaForm({
  comerciales,
  brokers,
  proveedores,
  apns,
  clientes,
}: {
  comerciales: UsuarioOpcion[];
  brokers: UsuarioOpcion[];
  proveedores: OpcionNombre[];
  apns: OpcionNombre[];
  clientes: ClienteOpcion[];
}) {
  const [sims, setSims] = useState<SimRowInput[]>([nuevaFila()]);
  const [clienteNombre, setClienteNombre] = useState("");
  const [planUnidad, setPlanUnidad] = useState("Gigas");
  const [planCantidad, setPlanCantidad] = useState("");
  const [tipoPlan, setTipoPlan] = useState("Prepago");
  const [duracionMeses, setDuracionMeses] = useState("12");
  const [pagoMomento, setPagoMomento] = useState("Anticipado");
  const [precioCliente, setPrecioCliente] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState(() => new Date().toISOString().slice(0, 10));
  const [comercialId, setComercialId] = useState("");
  const [brokerId, setBrokerId] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [existingSimId, setExistingSimId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateSim(index: number, patch: Partial<SimRowInput>) {
    setSims((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addSim() {
    setSims((prev) => [...prev, nuevaFila()]);
  }

  function removeSim(index: number) {
    setSims((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExistingSimId(null);
    startTransition(async () => {
      const result = await crearEntrega({
        cliente_nombre: clienteNombre,
        plan_unidad: planUnidad,
        plan_cantidad: planCantidad,
        tipo_plan: tipoPlan,
        duracion_meses: tipoPlan === "Prepago" ? duracionMeses : "",
        pago_momento: pagoMomento,
        precio_cliente: precioCliente,
        fecha_entrega: fechaEntrega,
        comercial_id: comercialId,
        broker_id: brokerId,
        sims: sims.map((s) => ({ ...s, fecha_activacion: s.fecha_activacion || fechaEntrega })),
      });
      if (result?.error) {
        setError(result.error);
        setExistingSimId(result.existingSimId ?? null);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8 max-w-3xl">
      {/* --- Datos del cliente y del plan --- */}
      <section className="rounded-xl border bg-white p-6" style={{ borderColor: "var(--border)" }}>
        <h2 className="font-display text-base font-semibold mb-4">Cliente y plan</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre del cliente" required className="col-span-2">
            <ClienteAutocomplete
              value={clienteNombre}
              onChange={setClienteNombre}
              clientes={clientes}
              placeholder="Escribe o elige un cliente activo…"
              required
            />
            <Link href="/dashboard/clientes" className="text-xs mt-1 inline-block" style={{ color: "var(--text-secondary)" }}>
              ¿No aparece? Regístralo en Clientes →
            </Link>
          </Field>

          <Field label="Tipo de plan" required>
            <select required value={tipoPlan} onChange={(e) => setTipoPlan(e.target.value)} className="input">
              <option value="Prepago">Prepago</option>
              <option value="Postpago">Postpago</option>
            </select>
          </Field>

          {tipoPlan === "Prepago" && (
            <Field label="Duración del plan" required>
              <select required value={duracionMeses} onChange={(e) => setDuracionMeses(e.target.value)} className="input">
                <option value="6">6 meses</option>
                <option value="12">12 meses</option>
              </select>
            </Field>
          )}

          <Field label="Forma de pago" required>
            <select required value={pagoMomento} onChange={(e) => setPagoMomento(e.target.value)} className="input">
              <option value="Anticipado">Anticipado</option>
              <option value="Mes vencido">Mes vencido (factura)</option>
            </select>
          </Field>

          <Field label="Cantidad de datos" required>
            <input
              required
              type="number"
              min="0"
              step="0.1"
              value={planCantidad}
              onChange={(e) => setPlanCantidad(e.target.value)}
              className="input"
              placeholder="Ej: 10"
            />
          </Field>

          <Field label="Unidad" required>
            <select required value={planUnidad} onChange={(e) => setPlanUnidad(e.target.value)} className="input">
              <option value="Megas">Megas</option>
              <option value="Gigas">Gigas</option>
            </select>
          </Field>

          <Field label="Precio a cliente (COP)" required>
            <input
              required
              type="number"
              min="0"
              value={precioCliente}
              onChange={(e) => setPrecioCliente(e.target.value)}
              className="input"
              placeholder="Ej: 25000"
            />
          </Field>

          <Field label="Fecha de entrega" required>
            <input
              required
              type="date"
              value={fechaEntrega}
              onChange={(e) => setFechaEntrega(e.target.value)}
              className="input"
            />
          </Field>

          <Field label="Comercial que entrega" required>
            <select required value={comercialId} onChange={(e) => setComercialId(e.target.value)} className="input">
              <option value="">Selecciona…</option>
              {comerciales.map((c) => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </select>
          </Field>

          <Field label="Broker asociado (opcional)">
            <select value={brokerId} onChange={(e) => setBrokerId(e.target.value)} className="input">
              <option value="">Sin broker</option>
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>{b.full_name}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      {/* --- SIMs a entregar --- */}
      <section className="rounded-xl border bg-white p-6" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-base font-semibold">SIM cards de esta entrega</h2>
          <button
            type="button"
            onClick={addSim}
            className="text-sm font-medium rounded-lg border px-3 py-1.5"
            style={{ borderColor: "var(--border)" }}
          >
            + Agregar SIM
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {sims.map((sim, i) => (
            <div key={i} className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  SIM #{i + 1}
                </span>
                {sims.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSim(i)}
                    className="text-xs"
                    style={{ color: "var(--state-desactivada)" }}
                  >
                    Quitar
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="ICC" required>
                  <input
                    required
                    value={sim.icc}
                    onChange={(e) => updateSim(i, { icc: e.target.value })}
                    className="input font-mono"
                    placeholder="89570..."
                  />
                </Field>

                <Field label="Proveedor" required>
                  <select
                    required
                    value={sim.proveedor}
                    onChange={(e) => updateSim(i, { proveedor: e.target.value })}
                    className="input"
                  >
                    <option value="">Selecciona…</option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </Field>

                <Field
                  label="Número corto"
                  required={sim.proveedor.trim().toLowerCase() === "claro"}
                >
                  <input
                    value={sim.numero_corto}
                    onChange={(e) => updateSim(i, { numero_corto: e.target.value })}
                    className="input font-mono"
                    placeholder={sim.proveedor.trim().toLowerCase() === "claro" ? "Obligatorio para Claro" : "Si aplica"}
                  />
                </Field>

                <Field label="Estado de entrega" required>
                  <select
                    required
                    value={sim.estado_entrega}
                    onChange={(e) => updateSim(i, { estado_entrega: e.target.value })}
                    className="input"
                  >
                    {ESTADOS_SIM.map((e) => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                </Field>

                {sim.estado_entrega === "Activa" && (
                  <Field label="Fecha de activación" required>
                    <input
                      required
                      type="date"
                      value={sim.fecha_activacion || fechaEntrega}
                      onChange={(e) => updateSim(i, { fecha_activacion: e.target.value })}
                      className="input"
                    />
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                      Por defecto es la misma fecha de entrega, pero puedes cambiarla — incluso a una fecha anterior (por ejemplo, al cargar inventario ya activado antes).
                      {tipoPlan === "Prepago" && (
                        <> Con {duracionMeses} meses, el plan vence el <strong>{sumarMeses(sim.fecha_activacion || fechaEntrega, Number(duracionMeses))}</strong>.</>
                      )}
                    </p>
                  </Field>
                )}

                <Field label="APN">
                  <select
                    value={sim.apn}
                    onChange={(e) => updateSim(i, { apn: e.target.value })}
                    className="input"
                  >
                    <option value="">Sin especificar</option>
                    {apns.map((a) => (
                      <option key={a.id} value={a.name}>{a.name}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Observaciones" className="col-span-2">
                  <textarea
                    value={sim.observaciones}
                    onChange={(e) => updateSim(i, { observaciones: e.target.value })}
                    className="input"
                    rows={2}
                    placeholder="Notas libres sobre esta SIM (opcional)"
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </section>

      {error && (
        <p className="text-sm rounded-lg px-4 py-3" style={{ background: "#FDEAEA", color: "var(--state-desactivada)" }}>
          {error}
          {existingSimId && (
            <>
              {" "}
              <Link href={`/dashboard/sim/${existingSimId}`} className="underline font-medium">
                Ver esa SIM →
              </Link>
            </>
          )}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--ink-900)" }}
        >
          {isPending ? "Guardando…" : "Guardar entrega"}
        </button>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Todos los campos son obligatorios, salvo el broker.
        </span>
      </div>

      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid var(--border);
          border-radius: 0.5rem;
          padding: 0.55rem 0.75rem;
          font-size: 0.875rem;
          background: white;
          outline: none;
        }
        .input:focus {
          border-color: var(--chip-gold);
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        {label} {required && <span style={{ color: "var(--state-desactivada)" }}>*</span>}
      </label>
      {children}
    </div>
  );
}
