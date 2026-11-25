/**
 * CAPA DE INTEGRACIÓN CON PROVEEDORES
 * -------------------------------------------------
 * Cada proveedor (Claro, Movistar, Wireless Logic, etc.) tiene su propia API,
 * con su propio formato de autenticación y de datos. Para que agregar un
 * proveedor nuevo no obligue a tocar el resto de la plataforma, cada uno se
 * implementa como un "conector" (adapter) que cumple esta interfaz.
 *
 * Cómo agregar un proveedor real cuando tengas sus credenciales de API:
 * 1. Crea un archivo en esta carpeta, ej. `claroAdapter.ts`, que implemente
 *    `ProviderAdapter` llamando a los endpoints reales de ese proveedor.
 * 2. Regístralo en `registry.ts` bajo un slug (ej. "claro").
 * 3. En Configuración → Proveedores, edita ese proveedor y selecciona ese
 *    slug en "Conector", junto con la URL base y las credenciales.
 * Nada más del código necesita cambiar — las páginas y acciones de
 * sincronización ya funcionan contra la interfaz, no contra un proveedor
 * específico.
 */

export interface ProviderApiConfig {
  baseUrl: string;
  apiKey?: string | null;
  apiSecret?: string | null;
}

// Lo que devuelve el proveedor sobre una SIM, en su propio formato.
// El conector es responsable de traducir la respuesta cruda del proveedor
// a esta forma común.
export interface ProviderFetchedSim {
  icc: string;
  numero_corto?: string;
  estado_proveedor: string; // texto crudo tal como lo reporta el proveedor
  apn?: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

export interface ProviderAdapter {
  /** Slug único, usado en providers.integration_slug */
  slug: string;
  /** Nombre legible, solo para mostrar en la UI */
  label: string;
  /** Verifica que las credenciales/URL sean correctas antes de sincronizar */
  testConnection(config: ProviderApiConfig): Promise<ConnectionTestResult>;
  /** Trae el inventario completo (o el estado actual) reportado por el proveedor */
  fetchInventory(config: ProviderApiConfig): Promise<ProviderFetchedSim[]>;
}

// Mapeo del texto crudo del proveedor -> uno de nuestros ESTADOS_SIM.
// Cada conector puede tener su propio mapeo; este es el genérico de respaldo.
export function mapEstadoGenerico(estadoProveedor: string): string | null {
  const normalizado = estadoProveedor.trim().toLowerCase();
  const tabla: Record<string, string> = {
    activa: "Activa",
    active: "Activa",
    activo: "Activa",
    inactiva: "Inactiva",
    inactive: "Inactiva",
    suspendida: "Desactivada temporal",
    suspended: "Desactivada temporal",
    cancelada: "Desactivada",
    cancelled: "Desactivada",
    canceled: "Desactivada",
    "lista para activar": "Lista para activar",
    "ready to activate": "Lista para activar",
  };
  return tabla[normalizado] ?? null;
}
