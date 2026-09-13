export function normalizarTexto(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita tildes
    .replace(/\s+/g, " ");
}

/**
 * Busca `valorEscrito` dentro de `opcionesValidas` sin importar mayúsculas,
 * minúsculas ni tildes (por ejemplo, "POSTPAGO", "postpago" y "Postpago"
 * deben tratarse como el mismo valor). Si encuentra coincidencia, devuelve
 * el valor tal como está escrito en `opcionesValidas` (su forma "canónica"
 * — cada campo tiene la suya: unos van en mayúscula sostenida como
 * INDUSTRIAS, otros en formato oración como los estados de SIM — así que
 * nunca se asume un formato fijo, se usa el que ya está definido).
 * Devuelve null si no hay ninguna coincidencia.
 */
export function emparejarValorInsensible<T extends string>(valorEscrito: string, opcionesValidas: readonly T[]): T | null {
  const norm = normalizarTexto(valorEscrito);
  if (!norm) return null;
  return opcionesValidas.find((op) => normalizarTexto(op) === norm) ?? null;
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

export interface CoincidenciaCliente {
  nombre: string;
  /** "exacta": mismo texto, solo cambia mayúsculas/minúsculas/tildes/espacios
   *  — es sin duda el mismo cliente, no hace falta preguntar.
   *  "aproximada": se parece (posible typo) pero no es el mismo texto — acá
   *  sí conviene confirmar con la persona antes de asumir que es el mismo. */
  tipo: "exacta" | "aproximada";
}

/**
 * Como `encontrarClienteSimilar`, pero además indica si la coincidencia es
 * exacta (mismo texto salvo formato) o solo aproximada (probable typo) —
 * así quien la use puede resolver las exactas en automático y solo pedir
 * confirmación humana para las aproximadas.
 */
export function encontrarClienteSimilarConTipo(nombreEscrito: string, clientesExistentes: string[]): CoincidenciaCliente | null {
  const normEscrito = normalizarTexto(nombreEscrito);
  if (!normEscrito) return null;

  let mejor: { nombre: string; distancia: number } | null = null;

  for (const existente of clientesExistentes) {
    const normExistente = normalizarTexto(existente);
    if (normExistente === normEscrito) return { nombre: existente, tipo: "exacta" };

    const distancia = distanciaLevenshtein(normEscrito, normExistente);
    const umbral = Math.max(2, Math.floor(normExistente.length * 0.2));
    if (distancia <= umbral && (!mejor || distancia < mejor.distancia)) {
      mejor = { nombre: existente, distancia };
    }
  }

  return mejor ? { nombre: mejor.nombre, tipo: "aproximada" } : null;
}

/**
 * Busca, entre una lista de nombres ya existentes, uno que probablemente sea
 * el mismo cliente que `nombreEscrito` pero tecleado distinto (mayúsculas,
 * tildes, espacios, o un typo). Devuelve el nombre existente sugerido, o
 * null si no hay ninguno parecido (probablemente sí es un cliente nuevo).
 */
export function encontrarClienteSimilar(nombreEscrito: string, clientesExistentes: string[]): string | null {
  return encontrarClienteSimilarConTipo(nombreEscrito, clientesExistentes)?.nombre ?? null;
}
