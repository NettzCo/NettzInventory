"use client";

import { useState } from "react";
import ClienteAutocomplete, { ClienteOpcion } from "./ClienteAutocomplete";

/**
 * Igual que ClienteAutocomplete, pero se puede usar directamente dentro de
 * un <form method="get"> renderizado por un Server Component — mantiene su
 * propio estado y expone un <input name=...> normal, así que al enviar el
 * formulario funciona exactamente como cualquier otro filtro de texto.
 *
 * Se puede escribir el nombre tal cual (y filtra por coincidencia, como
 * antes) o elegir de la lista desplegable con todos los clientes.
 */
export default function ClienteFilterInput({
  name,
  defaultValue,
  clientes,
  placeholder,
  className,
}: {
  name: string;
  defaultValue?: string;
  clientes: ClienteOpcion[];
  placeholder?: string;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");

  return (
    <>
      {/* ClienteAutocomplete solo mantiene estado en memoria (onChange),
          su input visible no tiene "name" — este input oculto, sincronizado
          con el mismo valor, es el que de verdad se envía al hacer submit
          del <form method="get">. */}
      <input type="hidden" name={name} value={value} />
      <ClienteAutocomplete
        value={value}
        onChange={setValue}
        clientes={clientes}
        placeholder={placeholder}
        className={className}
      />
    </>
  );
}
