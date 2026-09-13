import { EstadoSim } from "@/lib/types";
import { ESTADO_COLOR } from "@/lib/ui";

export default function StatusPill({ estado }: { estado: EstadoSim | null }) {
  if (!estado) {
    return (
      <span className="status-pill" style={{ background: "#EEF0F4", color: "var(--text-muted)" }}>
        Sin estado
      </span>
    );
  }

  const color = ESTADO_COLOR[estado];

  // "Vencida" necesita destacar de verdad — fondo sólido y texto blanco,
  // en vez del tinte suave que usan los demás estados.
  if (estado === "Vencida") {
    return (
      <span className="status-pill" style={{ background: color, color: "#fff", fontWeight: 600 }}>
        <span className="status-dot" style={{ background: "#fff" }} />
        {estado}
      </span>
    );
  }

  return (
    <span
      className="status-pill"
      style={{ background: `${color}1A`, color }}
    >
      <span className="status-dot" style={{ background: color }} />
      {estado}
    </span>
  );
}
