"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function PageSizeSelect({ value, opciones }: { value: number; opciones: number[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("per_page", e.target.value);
    // Al cambiar cuántas SIM se muestran por página, se vuelve a la
    // página 1 — si no, se podría quedar "más allá" del final.
    params.set("page", "1");
    router.push(`/dashboard/inventario?${params.toString()}`);
  }

  return (
    <select name="per_page" value={value} onChange={handleChange} className="input-filter">
      {opciones.map((n) => (
        <option key={n} value={n}>{n} por página</option>
      ))}
    </select>
  );
}
