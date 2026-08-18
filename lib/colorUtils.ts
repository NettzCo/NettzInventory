function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return "#" + [clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** amount > 0 aclara, amount < 0 oscurece (rango sugerido: -1 a 1) */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const target = amount > 0 ? 255 : 0;
  const pct = Math.abs(amount);
  return rgbToHex(
    r + (target - r) * pct,
    g + (target - g) * pct,
    b + (target - b) * pct
  );
}

/** true si el color es claro (para decidir si el texto encima debe ser negro o blanco) */
export function esColorClaro(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

/** A partir de los 2 colores elegidos por la organización, deriva toda la
 * paleta de tonos que usa la interfaz (mismo patrón que --ink-950…--ink-100
 * y --chip-gold-soft en globals.css). */
export function derivarPaleta(colorInk: string, colorAccent: string) {
  return {
    ink950: shade(colorInk, -0.35),
    ink900: colorInk,
    ink800: shade(colorInk, 0.18),
    ink700: shade(colorInk, 0.35),
    ink100: shade(colorInk, 0.92),
    chipGold: colorAccent,
    chipGoldSoft: shade(colorAccent, 0.85),
  };
}
