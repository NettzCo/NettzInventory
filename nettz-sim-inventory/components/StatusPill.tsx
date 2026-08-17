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
