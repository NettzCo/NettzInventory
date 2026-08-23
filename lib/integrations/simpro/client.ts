/**
 * Cliente de la API REST de SIMPro (Wireless Logic).
 * Servidor: https://simpro4.wirelesslogic.com — spec OpenAPI provisto por
 * Wireless Logic (SIMPro REST API v1.0.0).
 *
 * Autenticación: dos headers estáticos por request — x-api-client y
 * x-api-key — dados por Wireless Logic al configurar la cuenta. No hay
 * intercambio de token: se usan tal cual en cada llamada.
 */

const BASE_URL = "https://simpro4.wirelesslogic.com";

export class SimproConfigError extends Error {}
export class SimproApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function credenciales(): { apiClient: string; apiKey: string } {
  const apiClient = process.env.SIMPRO_API_CLIENT;
  const apiKey = process.env.SIMPRO_API_KEY;
  if (!apiClient || !apiKey) {
    throw new SimproConfigError(
      "Faltan las variables de entorno SIMPRO_API_CLIENT y/o SIMPRO_API_KEY. Configúralas en Vercel (Settings → Environment Variables) con las credenciales que te dio Wireless Logic."
    );
  }
  return { apiClient, apiKey };
}

async function simproFetch<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const { apiClient, apiKey } = credenciales();

  const url = new URL(path, BASE_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      "x-api-client": apiClient,
      "x-api-key": apiKey,
      Accept: "application/json",
    },
    // Nunca cachear: siempre queremos el estado más reciente de SIMPro.
    cache: "no-store",
  });

  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw new SimproApiError(`SIMPro respondió ${res.status} en ${path}: ${texto.slice(0, 300)}`, res.status);
  }

  return res.json() as Promise<T>;
}

// ---- Tipos (solo los campos que usamos) ----

export interface SimproSimListado {
  id: number;
  iccid: string;
  eid?: string;
  msisdn?: string;
  imsi?: string;
  status?: string;
  workflow_status?: string;
}

export interface SimproSimDetalle {
  id: number;
  iccid: string;
  eid?: string;
  imei?: string;
  dispatch_date?: string;
  billing_account?: { id: number; account_number: string; name: string };
  sim_group?: { id: number; name: string };
  mno_account?: { id: number; name: string; mno?: { name?: string } };
  active_connection?: {
    msisdn?: string;
    imsi?: string;
    activation_date?: string;
    contract_start_date?: string;
    contract_end_date?: string;
    cancellation_date?: string;
    customer_status?: { ident?: string };
    workflow_status?: { ident?: string };
    apns?: { name?: string }[];
  };
  custom_field1?: string;
  custom_field2?: string;
}

/** Trae SIM de la cuenta, paginando automáticamente. Es el listado liviano
 *  (sin detalle de cliente/activación todavía). Si se pasa `limite`, se
 *  detiene apenas junta esa cantidad — útil para probar la integración con
 *  pocas SIM antes de sincronizar el inventario completo. */
export async function listarTodasLasSims(onProgreso?: (traidas: number, total: number) => void, limite?: number): Promise<SimproSimListado[]> {
  const limit = 500;
  let page = 1;
  const todas: SimproSimListado[] = [];
  let total = Infinity;

  while (todas.length < total && (!limite || todas.length < limite)) {
    const data = await simproFetch<{ sims: SimproSimListado[]; sim_count: number }>("/api/v3/sims", { page, limit });
    todas.push(...data.sims);
    total = data.sim_count;
    onProgreso?.(todas.length, total);
    if (data.sims.length === 0) break; // seguro anti-loop infinito
    page++;
  }

  return limite ? todas.slice(0, limite) : todas;
}

/** Trae el detalle completo (cliente, fecha de activación, estado, IMEI,
 *  proveedor real) para un lote de ICCIDs. SIMPro limita cuántos
 *  identificadores acepta por llamada, así que se debe llamar en lotes. */
export async function obtenerDetallesSims(iccids: string[]): Promise<SimproSimDetalle[]> {
  if (iccids.length === 0) return [];
  return simproFetch<SimproSimDetalle[]>("/api/v3/sims/details", { identifiers: iccids.join(",") });
}

export const LOTE_DETALLES = 100; // ICCIDs por llamada a /sims/details — ajustar si SIMPro devuelve error de "demasiados identificadores"
