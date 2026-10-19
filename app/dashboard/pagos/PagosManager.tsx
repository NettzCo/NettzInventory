"use client";

import { useState, useEffect, useTransition } from "react";
import {
  buscarSimParaPago,
  registrarPago,
  subirComprobantePago,
  obtenerArchivosPago,
  eliminarArchivoPago,
  listarPagos,
  PagoListado,
  ItemPagoInput,
  ArchivoPago,
} from "./actions";
import { traducirError } from "@/lib/friendlyError";
import { formatFecha, formatMoneda, hoyColombia } from "@/lib/ui";

interface FilaFormulario extends ItemPagoInput {
  key: string;
  clienteEncontrado: string | null;
  buscando: boolean;
  noEncontrada: boolean;
}

function filaVacia(): FilaFormulario {
  return {
    key: Math.random().toString(36).slice(2),
    icc: "",
    fechaRenovadoHasta: "",
    valor: 0,
    clienteEncontrado: null,
    buscando: false,
    noEncontrada: false,
  };
}

export default function PagosManager({
  pagosIniciales,
  errorInicial,
}: {
  pagosIniciales: PagoListado[];
  errorInicial: string | null;
}) {
  const [pagos, setPagos] = useState(pagosIniciales);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  // --- Formulario ---
  const [clienteNombre, setClienteNombre] = useState("");
  const [fechaPago, setFechaPago] = useState(() => hoyColombia());
  const [nota, setNota] = useState("");
  const [filas, setFilas] = useState<FilaFormulario[]>([filaVacia()]);
  const [errorForm, setErrorForm] = useState<string | null>(errorInicial ? traducirError(errorInicial) : null);
  const [isPending, startTransition] = useTransition();
  const [pagoCreado, setPagoCreado] = useState<{ id: string; numeroComprobante: string } | null>(null);
  const [subiendoComprobante, setSubiendoComprobante] = useState(false);
  const [archivosPago, setArchivosPago] = useState<ArchivoPago[]>([]);
  const [pagoAbierto, setPagoAbierto] = useState<string | null>(null); // id del pago con el panel de archivos abierto en la tabla

  // --- Filtros de la tabla ---
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroIcc, setFiltroIcc] = useState("");
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");
  const [cargandoFiltro, startFiltro] = useTransition();

  function actualizarFila(key: string, cambios: Partial<FilaFormulario>) {
    setFilas((prev) => prev.map((f) => (f.key === key ? { ...f, ...cambios } : f)));
  }

  function quitarFila(key: string) {
    setFilas((prev) => (prev.length > 1 ? prev.filter((f) => f.key !== key) : prev));
  }

  async function buscarIcc(key: string, icc: string) {
    actualizarFila(key, { icc, buscando: true, noEncontrada: false, clienteEncontrado: null });
    if (!icc.trim()) {
      actualizarFila(key, { buscando: false });
      return;
    }
    const res = await buscarSimParaPago(icc.trim());
    if ("error" in res) {
      actualizarFila(key, { buscando: false, noEncontrada: true });
      return;
    }
    if (!res.sim) {
      actualizarFila(key, { buscando: false, noEncontrada: true });
      return;
    }
    // Sugerencia: si ya tiene un vencimiento calculado, se renueva un
    // período más desde ahí; si no, desde la fecha de pago elegida.
    const base = res.sim.vencimientoActual ? new Date(`${res.sim.vencimientoActual}T00:00:00`) : new Date(`${fechaPago}T00:00:00`);
    base.setMonth(base.getMonth() + (res.sim.duracionMeses ?? 12));
    actualizarFila(key, {
      buscando: false,
      noEncontrada: false,
      clienteEncontrado: res.sim.clienteActual,
      fechaRenovadoHasta: base.toISOString().slice(0, 10),
    });
  }

  function enviarPago() {
    setErrorForm(null);
    if (!clienteNombre.trim()) { setErrorForm("Falta el nombre del cliente."); return; }
    const items = filas.filter((f) => f.icc.trim());
    if (items.length === 0) { setErrorForm("Agrega al menos una SIM."); return; }
    for (const it of items) {
      if (it.noEncontrada) { setErrorForm(`El ICC ${it.icc} no se encontró en el inventario.`); return; }
      if (!it.fechaRenovadoHasta) { setErrorForm(`Falta la fecha de renovación para el ICC ${it.icc}.`); return; }
      if (!it.valor || it.valor <= 0) { setErrorForm(`Falta el valor pagado por el ICC ${it.icc}.`); return; }
    }

    startTransition(async () => {
      const res = await registrarPago({
        clienteNombre: clienteNombre.trim(),
        fechaPago,
        nota: nota.trim() || undefined,
        items: items.map((f) => ({ icc: f.icc.trim(), fechaRenovadoHasta: f.fechaRenovadoHasta, valor: Number(f.valor) })),
      });
      if (res.error) { setErrorForm(traducirError(res.error)); return; }
      setPagoCreado({ id: res.pagoId!, numeroComprobante: res.numeroComprobante! });
      const actualizados = await listarPagos();
      if (!("error" in actualizados)) setPagos(actualizados);
    });
  }

  async function subirArchivos(files: FileList) {
    if (!pagoCreado) return;
    setSubiendoComprobante(true);
    const fd = new FormData();
    for (const file of Array.from(files)) fd.append("files", file);
    const res = await subirComprobantePago(pagoCreado.id, fd);
    setSubiendoComprobante(false);
    if (res.error) { setErrorForm(traducirError(res.error)); return; }
    setArchivosPago((prev) => [...(res.archivos ?? []), ...prev]);
  }

  function nuevoPago() {
    setMostrarFormulario(true);
    setPagoCreado(null);
    setArchivosPago([]);
    setClienteNombre("");
    setFechaPago(hoyColombia());
    setNota("");
    setFilas([filaVacia()]);
    setErrorForm(null);
  }

  function aplicarFiltros() {
    startFiltro(async () => {
      const res = await listarPagos({
        cliente: filtroCliente.trim() || undefined,
        icc: filtroIcc.trim() || undefined,
        fechaDesde: filtroDesde || undefined,
        fechaHasta: filtroHasta || undefined,
      });
      if (!("error" in res)) setPagos(res);
    });
  }

  const urlExportar = (() => {
    const params = new URLSearchParams();
    if (filtroCliente) params.set("cliente", filtroCliente);
    if (filtroIcc) params.set("icc", filtroIcc);
    if (filtroDesde) params.set("fecha_desde", filtroDesde);
    if (filtroHasta) params.set("fecha_hasta", filtroHasta);
    return `/dashboard/pagos/exportar?${params.toString()}`;
  })();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {pagos.length} pago{pagos.length === 1 ? "" : "s"} registrado{pagos.length === 1 ? "" : "s"}
        </p>
        <div className="flex gap-3">
          <a href={urlExportar} className="rounded-lg border px-4 py-2.5 text-sm font-medium bg-white flex items-center" style={{ borderColor: "var(--border)" }}>
            {"\u2B07"} Exportar a Excel
          </a>
          {!mostrarFormulario && (
            <button onClick={nuevoPago} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white" style={{ background: "var(--ink-900)" }}>
              + Registrar pago
            </button>
          )}
        </div>
      </div>

      {mostrarFormulario && (
        <div className="rounded-xl border bg-white p-6" style={{ borderColor: "var(--border)" }}>
          {!pagoCreado ? (
            <>
              <h2 className="text-base font-semibold mb-4">Registrar pago adelantado</h2>

              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Cliente *</label>
                  <input className="input" value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} placeholder="Nombre del cliente" />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Fecha de pago *</label>
                  <input className="input" type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
                </div>
              </div>

              <div className="mb-2">
                <label className="text-xs font-medium block mb-2" style={{ color: "var(--text-secondary)" }}>SIM pagadas</label>
                <div className="flex flex-col gap-2">
                  {filas.map((f) => (
                    <div key={f.key} className="flex items-start gap-2">
                      <div className="flex-1">
                        <input
                          className="input"
                          placeholder="ICC"
                          value={f.icc}
                          onChange={(e) => actualizarFila(f.key, { icc: e.target.value })}
                          onBlur={(e) => buscarIcc(f.key, e.target.value)}
                        />
                        {f.buscando && <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Buscando…</p>}
                        {f.noEncontrada && <p className="text-xs mt-1" style={{ color: "var(--state-desactivada)" }}>No se encontró esa SIM.</p>}
                        {f.clienteEncontrado && <p className="text-xs mt-1" style={{ color: "var(--state-activa)" }}>Cliente actual: {f.clienteEncontrado}</p>}
                      </div>
                      <div style={{ width: "160px" }}>
                        <input
                          className="input"
                          type="date"
                          value={f.fechaRenovadoHasta}
                          onChange={(e) => actualizarFila(f.key, { fechaRenovadoHasta: e.target.value })}
                        />
                      </div>
                      <div style={{ width: "140px" }}>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          placeholder="Valor"
                          value={f.valor || ""}
                          onChange={(e) => actualizarFila(f.key, { valor: Number(e.target.value) })}
                        />
                      </div>
                      <button
                        onClick={() => quitarFila(f.key)}
                        disabled={filas.length === 1}
                        className="text-sm px-2 py-2 disabled:opacity-30"
                        style={{ color: "var(--state-desactivada)" }}
                        title="Quitar esta fila"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
                  <span>ICC · Renovada hasta · Valor</span>
                  <span>
                    Total: {formatMoneda(filas.reduce((acc, f) => acc + (Number(f.valor) || 0), 0))}
                  </span>
                </div>
                <button
                  onClick={() => setFilas((prev) => [...prev, filaVacia()])}
                  className="text-sm font-medium mt-2"
                  style={{ color: "var(--ink-900)" }}
                >
                  + Agregar otra SIM
                </button>
              </div>

              <div className="mb-4">
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Nota (opcional)</label>
                <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: pagado por transferencia Bancolombia" />
              </div>

              {errorForm && (
                <p className="text-sm rounded-lg px-3 py-2 mb-4" style={{ background: "#FDEAEA", color: "var(--state-desactivada)" }}>
                  {errorForm}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={enviarPago}
                  disabled={isPending}
                  className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: "var(--ink-900)" }}
                >
                  {isPending ? "Guardando…" : "Registrar pago"}
                </button>
                <button onClick={() => setMostrarFormulario(false)} className="rounded-lg border px-4 py-2.5 text-sm font-medium bg-white" style={{ borderColor: "var(--border)" }}>
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <div>
              <p className="text-sm rounded-lg px-3 py-2.5 mb-4" style={{ background: "#E7F5EC", color: "var(--state-activa)" }}>
                Pago registrado — comprobante <strong>{pagoCreado.numeroComprobante}</strong>. Las SIM ya quedaron renovadas.
              </p>

              <div className="flex flex-wrap items-center gap-3 mb-4">
                <a
                  href={`/dashboard/pagos/comprobante/${pagoCreado.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
                  style={{ background: "var(--ink-900)" }}
                >
                  Ver / descargar comprobante PDF
                </a>

                <label className="rounded-lg border px-4 py-2.5 text-sm font-medium bg-white cursor-pointer" style={{ borderColor: "var(--border)" }}>
                  {subiendoComprobante ? "Subiendo…" : "Adjuntar foto(s) del pago del cliente"}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    className="hidden"
                    disabled={subiendoComprobante}
                    onChange={(e) => { if (e.target.files?.length) subirArchivos(e.target.files); e.target.value = ""; }}
                  />
                </label>
              </div>

              {archivosPago.length > 0 && (
                <div className="flex flex-wrap gap-3 mb-4">
                  {archivosPago.map((a) => (
                    <GaleriaMiniatura key={a.id} archivo={a} onEliminar={() => setArchivosPago((prev) => prev.filter((x) => x.id !== a.id))} />
                  ))}
                </div>
              )}

              <button onClick={nuevoPago} className="text-sm font-medium" style={{ color: "var(--ink-900)" }}>
                + Registrar otro pago
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="rounded-xl border bg-white p-4 flex flex-wrap items-end gap-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Cliente</label>
          <input className="input-filter" value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} placeholder="Buscar cliente…" />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>ICC</label>
          <input className="input-filter" value={filtroIcc} onChange={(e) => setFiltroIcc(e.target.value)} placeholder="Buscar ICC…" />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Desde</label>
          <input className="input-filter" type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Hasta</label>
          <input className="input-filter" type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} />
        </div>
        <button onClick={aplicarFiltros} disabled={cargandoFiltro} className="rounded-lg border px-4 py-2 text-sm font-medium bg-white" style={{ borderColor: "var(--border)" }}>
          {cargandoFiltro ? "Buscando…" : "Aplicar filtros"}
        </button>
      </div>

      {/* Tabla */}
      <div className="rounded-xl border overflow-hidden bg-white" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              <Th>Comprobante</Th>
              <Th>Cliente</Th>
              <Th>Fecha de pago</Th>
              <Th>SIM</Th>
              <Th>Valor total</Th>
              <Th>Comprobante cliente</Th>
              <Th>{""}</Th>
            </tr>
          </thead>
          <tbody>
            {pagos.map((p) => (
              <tr key={p.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-3 font-medium">{p.numero_comprobante}</td>
                <td className="px-4 py-3">{p.cliente_nombre}</td>
                <td className="px-4 py-3">{formatFecha(p.fecha_pago)}</td>
                <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                  {p.sims.length} SIM{p.sims.length === 1 ? "" : "s"}
                </td>
                <td className="px-4 py-3">{formatMoneda(p.valor_total)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => setPagoAbierto(p.id)} className="hover:underline" style={{ color: p.archivos.length > 0 ? "var(--ink-900)" : "var(--text-muted)" }}>
                    {p.archivos.length > 0 ? `${p.archivos.length} foto${p.archivos.length === 1 ? "" : "s"}` : "+ Adjuntar"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <a href={`/dashboard/pagos/comprobante/${p.id}`} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline" style={{ color: "var(--ink-900)" }}>
                    Ver PDF
                  </a>
                </td>
              </tr>
            ))}
            {pagos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  No hay pagos registrados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagoAbierto && (
        <PanelArchivosPago
          pagoId={pagoAbierto}
          onCerrar={() => {
            setPagoAbierto(null);
            listarPagos().then((actualizados) => { if (!("error" in actualizados)) setPagos(actualizados); });
          }}
        />
      )}

      <style jsx global>{`
        .input { width: 100%; border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.55rem 0.75rem; font-size: 0.875rem; }
      `}</style>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium text-xs uppercase tracking-wide">{children}</th>;
}

/** Una miniatura de archivo adjunto (imagen o ícono si es PDF), con botón
 *  para quitarla. Se usa tanto justo al registrar como al consultar
 *  después un pago ya existente. */
function GaleriaMiniatura({ archivo, onEliminar }: { archivo: ArchivoPago; onEliminar: () => void }) {
  const [eliminando, setEliminando] = useState(false);
  const esPdf = archivo.nombre?.toLowerCase().endsWith(".pdf") || archivo.url.toLowerCase().endsWith(".pdf");

  function quitar() {
    if (!confirm("¿Quitar este archivo?")) return;
    setEliminando(true);
    eliminarArchivoPago(archivo.id).then((res) => {
      setEliminando(false);
      if (!res.error) onEliminar();
    });
  }

  return (
    <div className="relative group" style={{ width: "5.5rem" }}>
      <a href={archivo.url} target="_blank" rel="noreferrer" className="block rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)", width: "5.5rem", height: "5.5rem" }}>
        {esPdf ? (
          <div className="w-full h-full flex items-center justify-center text-xs font-semibold" style={{ background: "var(--bg)", color: "var(--text-muted)" }}>
            PDF
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- viene de Supabase Storage
          <img src={archivo.url} alt={archivo.nombre ?? "Comprobante"} className="w-full h-full object-cover" />
        )}
      </a>
      <button
        onClick={quitar}
        disabled={eliminando}
        title="Quitar"
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center"
        style={{ background: "var(--state-desactivada)", color: "white" }}
      >
        ×
      </button>
    </div>
  );
}

/** Panel para VER y AGREGAR archivos de un pago ya registrado (se abre
 *  desde la tabla de pagos, al "consultarlo" más adelante). */
function PanelArchivosPago({ pagoId, onCerrar }: { pagoId: string; onCerrar: () => void }) {
  const [archivos, setArchivos] = useState<ArchivoPago[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerArchivosPago(pagoId).then((res) => {
      setCargando(false);
      if ("error" in res) setError(traducirError(res.error));
      else setArchivos(res);
    });
  }, [pagoId]);

  function subir(files: FileList) {
    setSubiendo(true);
    setError(null);
    const fd = new FormData();
    for (const file of Array.from(files)) fd.append("files", file);
    subirComprobantePago(pagoId, fd).then((res) => {
      setSubiendo(false);
      if (res.error) { setError(traducirError(res.error)); return; }
      setArchivos((prev) => [...(res.archivos ?? []), ...prev]);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onCerrar}>
      <div className="rounded-xl bg-white p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-base font-semibold">Fotos del pago</h3>
          <button onClick={onCerrar} className="text-sm" style={{ color: "var(--text-secondary)" }}>Cerrar</button>
        </div>

        {error && <p className="text-sm mb-3" style={{ color: "var(--state-desactivada)" }}>{error}</p>}

        <label className="inline-block rounded-lg border px-4 py-2.5 text-sm font-medium bg-white cursor-pointer mb-4" style={{ borderColor: "var(--border)" }}>
          {subiendo ? "Subiendo…" : "+ Agregar foto(s)"}
          <input
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            disabled={subiendo}
            onChange={(e) => { if (e.target.files?.length) subir(e.target.files); e.target.value = ""; }}
          />
        </label>

        {cargando ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Cargando…</p>
        ) : archivos.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Todavía no hay fotos adjuntas a este pago.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {archivos.map((a) => (
              <GaleriaMiniatura key={a.id} archivo={a} onEliminar={() => setArchivos((prev) => prev.filter((x) => x.id !== a.id))} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
