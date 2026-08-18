"use client";

import { useState, useRef, useEffect } from "react";

export interface ClienteOpcion {
  id: string;
  nombre: string;
}

export default function ClienteAutocomplete({
  value,
  onChange,
  clientes,
  placeholder,
  required,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  clientes: ClienteOpcion[];
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const sugerencias = value.trim()
    ? clientes.filter((c) => c.nombre.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 8)
    : clientes.slice(0, 8);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        className={className ?? "input"}
        value={value}
        required={required}
        placeholder={placeholder ?? "Escribe o elige un cliente…"}
        onChange={(e) => { onChange(e.target.value); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        autoComplete="off"
      />
      {abierto && sugerencias.length > 0 && (
        <div
          className="rounded-lg border bg-white shadow-sm"
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20,
            borderColor: "var(--border)", maxHeight: "12rem", overflowY: "auto",
          }}
        >
          {sugerencias.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onChange(c.nombre); setAbierto(false); }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg)]"
            >
              {c.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
