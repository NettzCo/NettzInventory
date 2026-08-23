"use client";

import { useState, useTransition, useRef } from "react";
import { analizarCargaMasiva, confirmarCargaMasiva, FilaParseada, FilaResultado } from "./actions";

type Fase = "subir" | "revisar" | "listo";

export default function CargaMasivaForm() {
  const [fase, setFase] = useState<Fase>("subir");
  const [filas, setFilas] = useState<FilaParseada[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ creadas: number; actualizadas: number; sinCambios: number; resultados: FilaResultado[] } | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function asignarArchivo(file: File) {
    if (fileRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileRef.current.files = dt.files;
    }
    setNombreArchivo(file.name);
  }

  function handleSeleccionArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setNombreArchivo(file.name);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setArrastrando(false);
    const file = e.dataTransfer.files?.[0];
    if (file) asignarArchivo(file);
  }

  function handleAnalizar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Selecciona un archivo .xlsx."); return; }
    const formData = new FormData();
    formData.append("archivo", file);

    startTransition(async () => {
      const res = await analizarCargaMasiva(formData);
      if (res?.error) setError(res.error);
      else if (res?.ok) { setFilas(res.filas); setFase("revisar"); }
    });
  }

  function resolverCliente(fila: number, valor: string) {
    setFilas((prev) => prev.map((f) => (f.fila === fila ? { ...f, clienteResuelto: valor } : f)));
  }

  function resolverAccionExistente(fila: number, valor: "reemplazar" | "solo_estado") {
    setFilas((prev) => prev.map((f) => (f.fila === fila ? { ...f, accionExistente: valor } : f)));
  }

  function handleConfirmar() {
    startTransition(async () => {
      const res = await confirmarCargaMasiva(filas);
      setResultado({ creadas: res.creadas ?? 0, actualizadas: res.actualizadas ?? 0, sinCambios: res.sinCambios ?? 0, resultados: res.resultados ?? [] });
      setFase("listo");
    });
  }

  function reiniciar() {
    setFase("subir");
    setFilas([]);
    setResultado(null);
    setError(null);
    setNombreArchivo(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const filasConError = filas.filter((f) => f.errores.length > 0);
  const filasConClienteAmbiguo = filas.filter((f) => f.errores.length === 0 && f.clienteSugerido);
  const filasListas = filas.filter((f) => f.errores.length === 0 && !f.clienteSugerido);
  const filasNuevas = filasListas.filter((f) => f.esNueva);
  const filasExistentes = filasListas.filter((f) => !f.esNueva);
  const errores = resultado?.resultados.filter((r) => !r.ok) ?? [];

  return (
    <section className="rounded-xl border bg-white p-6" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-base font-semibold">Carga masiva desde Excel</h2>
        <a
          href="/dashboard/nueva/plantilla"
          className="text-sm font-medium rounded-lg border px-3 py-1.5"
          style={{ borderColor: "var(--border)" }}
        >
          Descargar plantilla
        </a>
      </div>

      {fase === "subir" && (
        <>
          <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
            La plantilla ya trae listas desplegables (proveedor, APN, plan, comercial, etc.) tomadas
            de la configuración actual, para evitar errores de escritura. Cada fila es una entrega
            completa; si el ICC ya existe, se actualiza y el cambio queda en su hoja de vida.
          </p>
          <form onSubmit={handleAnalizar} className="flex flex-col gap-3">
            <label
              htmlFor="sim-file-input"
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
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Solo archivos .xlsx</span>
            </label>
            <input id="sim-file-input" ref={fileRef} type="file" accept=".xlsx" onChange={handleSeleccionArchivo} className="hidden" />
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 self-start hover:underline cursor-pointer"
              style={{ background: "var(--ink-900)" }}
            >
              {isPending ? "Analizando…" : "Revisar archivo"}
            </button>
          </form>
          {error && (
            <p className="text-sm rounded-lg px-3 py-2 mt-3" style={{ background: "#FDEAEA", color: "var(--state-desactivada)" }}>
              {error}
            </p>
          )}
        </>
      )}

      {fase === "revisar" && (
        <div>
          <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
            {filasListas.length} lista(s) para cargar, {filasConClienteAmbiguo.length} necesitan confirmar el cliente, {filasConError.length} con error.
          </p>

          {filasExistentes.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-semibold mb-2">
                {filasExistentes.length} de estos ICC ya están en el inventario
              </h3>
              <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
                Elige qué hacer con cada una. El cambio queda registrado en su hoja de vida de todas formas.
              </p>
              <div className="flex flex-col gap-3">
                {filasExistentes.map((f) => (
                  <div key={f.fila} className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--chip-gold-soft)" }}>
                    <p className="text-sm mb-2">
                      Fila {f.fila} (ICC <span className="font-mono">{f.icc}</span>) ya existe.
                    </p>
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center gap-1.5 text-sm">
                        <input
                          type="radio"
                          name={`existente-${f.fila}`}
                          checked={f.accionExistente === "reemplazar"}
                          onChange={() => resolverAccionExistente(f.fila, "reemplazar")}
                        />
                        Reemplazar tal cual con lo del archivo (estado, cliente, plan y precio)
                      </label>
                      <label className="flex items-center gap-1.5 text-sm">
                        <input
                          type="radio"
                          name={`existente-${f.fila}`}
                          checked={f.accionExistente === "solo_estado"}
                          onChange={() => resolverAccionExistente(f.fila, "solo_estado")}
                        />
                        Solo cambiar el estado — dejar el cliente/plan actual sin tocar
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filasConClienteAmbiguo.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-semibold mb-2">Confirma estos clientes</h3>
              <div className="flex flex-col gap-3">
                {filasConClienteAmbiguo.map((f) => (
                  <div key={f.fila} className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                    <p className="text-sm mb-2">
                      Fila {f.fila} (ICC <span className="font-mono">{f.icc}</span>): escribiste{" "}
                      <span className="font-medium">&ldquo;{f.clienteEscrito}&rdquo;</span>. Encontré un cliente parecido:{" "}
                      <span className="font-medium">&ldquo;{f.clienteSugerido}&rdquo;</span>. ¿Es el mismo?
                    </p>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1.5 text-sm">
                        <input
                          type="radio"
                          name={`cliente-${f.fila}`}
                          checked={f.clienteResuelto === f.clienteSugerido}
                          onChange={() => resolverCliente(f.fila, f.clienteSugerido!)}
                        />
                        Sí, asignar a &ldquo;{f.clienteSugerido}&rdquo;
                      </label>
                      <label className="flex items-center gap-1.5 text-sm">
                        <input
                          type="radio"
                          name={`cliente-${f.fila}`}
                          checked={f.clienteResuelto === f.clienteEscrito}
                          onChange={() => resolverCliente(f.fila, f.clienteEscrito)}
                        />
                        No, es un cliente nuevo (&ldquo;{f.clienteEscrito}&rdquo;)
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filasConError.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--state-desactivada)" }}>
                Estas filas no se van a cargar
              </h3>
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                      <th className="px-3 py-2">Fila</th>
                      <th className="px-3 py-2">ICC</th>
                      <th className="px-3 py-2">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasConError.map((f) => (
                      <tr key={f.fila} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                        <td className="px-3 py-2">{f.fila}</td>
                        <td className="px-3 py-2 font-mono">{f.icc || "—"}</td>
                        <td className="px-3 py-2" style={{ color: "var(--state-desactivada)" }}>{f.errores.join("; ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm rounded-lg px-3 py-2 mb-4" style={{ background: "#FDEAEA", color: "var(--state-desactivada)" }}>
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleConfirmar}
              disabled={isPending || filas.length === filasConError.length}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--ink-900)" }}
            >
              {isPending
                ? "Guardando…"
                : filasExistentes.length > 0
                  ? `Confirmar: crear ${filasNuevas.length} y actualizar ${filasExistentes.length}`
                  : `Confirmar y cargar ${filas.length - filasConError.length} SIM`}
            </button>
            <button onClick={reiniciar} className="rounded-lg border px-4 py-2 text-sm font-medium bg-white" style={{ borderColor: "var(--border)" }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {fase === "listo" && resultado && (
        <div>
          <p className="text-sm rounded-lg px-3 py-2 mb-3" style={{ background: "#E7F5EC", color: "var(--state-activa)" }}>
            {resultado.creadas} creada{resultado.creadas === 1 ? "" : "s"} · {resultado.actualizadas} actualizada{resultado.actualizadas === 1 ? "" : "s"} (se guardó el cambio en su hoja de vida) · {resultado.sinCambios} sin cambios
            {errores.length > 0 && ` · ${errores.length} con error`}
          </p>
          {errores.length > 0 && (
            <div className="rounded-lg border overflow-hidden mb-3" style={{ borderColor: "var(--border)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                    <th className="px-3 py-2">Fila</th><th className="px-3 py-2">ICC</th><th className="px-3 py-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {errores.map((e) => (
                    <tr key={e.fila} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                      <td className="px-3 py-2">{e.fila}</td>
                      <td className="px-3 py-2 font-mono">{e.icc || "—"}</td>
                      <td className="px-3 py-2" style={{ color: "var(--state-desactivada)" }}>{e.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button onClick={reiniciar} className="rounded-lg border px-4 py-2 text-sm font-medium bg-white" style={{ borderColor: "var(--border)" }}>
            Cargar otro archivo
          </button>
        </div>
      )}
    </section>
  );
}
