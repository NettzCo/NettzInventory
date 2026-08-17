import { ProviderAdapter, ProviderApiConfig, ProviderFetchedSim } from "./types";

/**
 * CONECTOR DE DEMOSTRACIÓN
 * -------------------------------------------------
 * No llama a ninguna API real — existe para que "Probar conexión" y
 * "Sincronizar ahora" funcionen de punta a punta en Configuración →
 * Proveedores, mientras aún no tienes credenciales reales de ningún
 * proveedor. Úsalo como plantilla: copia este archivo y reemplaza el
 * cuerpo de `testConnection` y `fetchInventory` por las llamadas fetch()
 * reales a la API del proveedor.
 */
export const demoAdapter: ProviderAdapter = {
  slug: "demo",
  label: "Demostración (sin API real)",

  async testConnection(config: ProviderApiConfig) {
    if (!config.baseUrl) {
      return { ok: false, message: "Falta la URL base." };
    }
    return { ok: true, message: "Conexión de demostración exitosa (no se llamó a ninguna API real)." };
  },

  async fetchInventory(_config: ProviderApiConfig): Promise<ProviderFetchedSim[]> {
    // En un conector real, aquí harías algo como:
    //   const res = await fetch(`${config.baseUrl}/sims`, {
    //     headers: { Authorization: `Bearer ${config.apiKey}` },
    //   });
    //   const data = await res.json();
    //   return data.map(row => ({ icc: row.iccid, estado_proveedor: row.status, ... }));
    return [];
  },
};
