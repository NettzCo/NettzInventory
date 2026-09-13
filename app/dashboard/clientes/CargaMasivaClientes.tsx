"use client";

import { useRef, useState, useTransition } from "react";
import { analizarCargaMasivaClientes, confirmarCargaMasivaClientes, FilaClienteParseada } from "./actions";

export default function CargaMasivaClientes() {
  const [filas, setFilas] = useState<FilaClienteParseada[] | null>(null);
  const [decisiones, setDecisiones] = useState<Record<number, "nuevo" | "usar_sugerido">>({});
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ creados: number; omitidos: number; errores: string[] } | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function procesarArchivo(file: File) {
    setError(null);
    setResultado(null);
    setNombreArchivo(file.name);

    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      const res = await analizarCargaMasivaClientes(formData);
      if ("error" in res && res.error) {
        setError(res.error);
        setFilas(null);
        return;
      }
      const nuevasFilas = "filas" in res ? res.filas ?? [] : [];
      setFilas(nuevasFilas);
      // Por defecto: si hay un sugerido, lo dejamos sin decidir (obliga a elegir);
      // si no hay sugerido, se crea como nuevo directamente.
      const iniciales: Record<number, "nuevo" | "usar_sugerido"> = {};
      for (const f of nuevasFilas) {
        if (!f.clienteSugerido) iniciales[f.fila] = "nuevo";
      }
      setDecisiones(iniciales);
    });
  }

  function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    procesarArchivo(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setArrastrando(false);
    const file = e.dataTransfer.files?.[0];
    if (file) procesarArchivo(file);
  }

  function confirmarTodo() {
    if (!filas) return;
    startTransition(async () => {
      // Si eligieron "usar_sugerido", no lo creamos como cliente nuevo — se
      // asume que ya existe y esa fila solo aportaba información repetida.
      const filasACrear = filas.filter((f) => decisiones[f.fila] !== "usar_sugerido");
      const res = await confirmarCargaMasivaClientes(filasACrear);
      setResultado(res);
      setFilas(null);
      setDecisiones({});
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  function marcarTodas(decision: "nuevo" | "usar_sugerido") {
    if (!filas) return;
    setDecisiones((d) => {
      const nuevo = { ...d };
      for (const f of filas) {
        if (f.clienteSugerido) nuevo[f.fila] = decision;
      }
      return nuevo;
    });
  }

  function cancelar() {
    setFilas(null);
    setDecisiones({});
    setError(null);
    setNombreArchivo(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const faltanDecidir = filas?.some((f) => f.clienteSugerido && !decisiones[f.fila]) ?? false;
  const conError = filas?.filter((f) => f.error) ?? [];

  return (
    <section className="rounded-xl border bg-white p-6" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display text-base font-semibold">Carga masiva de clientes</h2>
        <a href="/dashboard/clientes/plantilla" className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          {"\u2B07"} Descargar plantilla
        </a>
      </div>
      <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
        Sube un Excel con varios clientes de una vez. A cada uno se le asigna automáticamente su código correlativo — nunca se repite.
      </p>

      {!filas && (
        <div>
          <label
            htmlFor="clientes-file-input"
            onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={handleDrop}
            className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-6 py-8 text-center cursor-pointer transition"
            style={{
              borderColor: arrastrando ? "var(--chip-gold)" : "var(--border)",
              background: arrastrando ? "var(--bg)" : "white",
            }}
          >
            <span style={{ fontSize: "1.75rem" }}>📄</span>
            <span className="text-sm font-medium">
              {nombreArchivo ?? "Arrastra tu Excel aquí, o haz clic para elegirlo"}
            </span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Solo archivos .xlsx o .xls</span>
          </label>
          <input
            id="clientes-file-input"
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleArchivo}
            disabled={isPending}
            className="hidden"
          />
        </div>
      )}
      {isPending && !filas && <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>Analizando archivo…</p>}
      {error && <p className="text-sm mt-3" style={{ color: "var(--state-desactivada)" }}>{error}</p>}

      {resultado && (
        <div className="rounded-lg p-3 mt-3 text-sm" style={{ background: "#E7F5EC", color: "var(--state-activa)" }}>
          {resultado.creados} cliente{resultado.creados === 1 ? "" : "s"} creado{resultado.creados === 1 ? "" : "s"} correctamente
          {resultado.omitidos > 0 ? ` · ${resultado.omitidos} omitido${resultado.omitidos === 1 ? "" : "s"} por error` : ""}.
          {resultado.errores.length > 0 && (
            <ul className="mt-2 list-disc pl-5" style={{ color: "var(--state-desactivada)" }}>
              {resultado.errores.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}

      {filas && (
        <div className="mt-2">
          <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
            {filas.length} fila{filas.length === 1 ? "" : "s"} encontrada{filas.length === 1 ? "" : "s"}.
            {conError.length > 0 && ` ${conError.length} con error — no se van a crear.`}
            {" "}Revisa los posibles duplicados antes de confirmar.
          </p>

          {filas.some((f) => f.clienteSugerido) && (
            <div className="flex gap-3 mb-3">
              <button
                onClick={() => marcarTodas("usar_sugerido")}
                className="text-xs font-medium hover:underline cursor-pointer"
                style={{ color: "var(--state-lista)" }}
              >
                Marcar todas: ya existen, no crear
              </button>
              <button
                onClick={() => marcarTodas("nuevo")}
                className="text-xs font-medium hover:underline cursor-pointer"
                style={{ color: "var(--state-activa)" }}
              >
                Marcar todas: son distintas, crear
              </button>
            </div>
          )}

          <div className="rounded-lg border overflow-hidden mb-4" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                  <th className="px-4 py-2 font-medium text-xs uppercase">Fila</th>
                  <th className="px-4 py-2 font-medium text-xs uppercase">Nombre</th>
                  <th className="px-4 py-2 font-medium text-xs uppercase">Documento</th>
                  <th className="px-4 py-2 font-medium text-xs uppercase">Industria</th>
                  <th className="px-4 py-2 font-medium text-xs uppercase">Situación</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.fila} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-2" style={{ color: "var(--text-muted)" }}>{f.fila}</td>
                    <td className="px-4 py-2">{f.nombre}</td>
                    <td className="px-4 py-2">{f.documento || "—"}</td>
                    <td className="px-4 py-2">{f.industria || "—"}</td>
                    <td className="px-4 py-2">
                      {f.error ? (
                        <span style={{ color: "var(--state-desactivada)" }}>{f.error}</span>
                      ) : f.clienteSugerido ? (
                        <div className="flex flex-col gap-1">
                          <span style={{ color: "var(--state-lista)" }}>
                            {f.motivoSugerencia === "documento"
                              ? <>Mismo documento que &ldquo;{f.clienteSugerido}&rdquo;, ¿ya existe?</>
                              : <>Se parece a &ldquo;{f.clienteSugerido}&rdquo;, ¿ya existe?</>}
                          </span>
                          <div className="flex gap-4">
                            <label className="flex items-center gap-1.5 text-xs">
                              <input
                                type="radio"
                                name={`decision-${f.fila}`}
                                checked={decisiones[f.fila] === "usar_sugerido"}
                                onChange={() => setDecisiones((d) => ({ ...d, [f.fila]: "usar_sugerido" }))}
                              />
                              Ya existe, no crear de nuevo
                            </label>
                            <label className="flex items-center gap-1.5 text-xs">
                              <input
                                type="radio"
                                name={`decision-${f.fila}`}
                                checked={decisiones[f.fila] === "nuevo"}
                                onChange={() => setDecisiones((d) => ({ ...d, [f.fila]: "nuevo" }))}
                              />
                              Es un cliente distinto, crearlo
                            </label>
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: "var(--state-activa)" }}>Se creará como nuevo</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {faltanDecidir && (
            <p className="text-sm mb-3" style={{ color: "var(--state-lista)" }}>
              Todavía faltan decisiones por tomar en las filas marcadas arriba.
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={confirmarTodo}
              disabled={isPending || faltanDecidir}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--ink-900)" }}
            >
              {isPending ? "Creando…" : "Confirmar y crear clientes"}
            </button>
            <button onClick={cancelar} disabled={isPending} className="rounded-lg border px-4 py-2 text-sm font-medium" style={{ borderColor: "var(--border)" }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
