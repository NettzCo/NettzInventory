export function normalizarTexto(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita tildes
    .replace(/\s+/g, " ");
}

export function distanciaLevenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/**
 * Busca, entre una lista de nombres ya existentes, uno que probablemente sea
 * el mismo cliente que `nombreEscrito` pero tecleado distinto (mayúsculas,
 * tildes, espacios, o un typo). Devuelve el nombre existente sugerido, o
 * null si no hay ninguno parecido (probablemente sí es un cliente nuevo).
 */
export function encontrarClienteSimilar(nombreEscrito: string, clientesExistentes: string[]): string | null {
  const normEscrito = normalizarTexto(nombreEscrito);
  if (!normEscrito) return null;

  let mejor: { nombre: string; distancia: number } | null = null;

  for (const existente of clientesExistentes) {
    const normExistente = normalizarTexto(existente);
    if (normExistente === normEscrito) return existente; // mismo texto, solo cambia formato/tildes

    const distancia = distanciaLevenshtein(normEscrito, normExistente);
    const umbral = Math.max(2, Math.floor(normExistente.length * 0.2));
    if (distancia <= umbral && (!mejor || distancia < mejor.distancia)) {
      mejor = { nombre: existente, distancia };
    }
  }

  return mejor ? mejor.nombre : null;
}
