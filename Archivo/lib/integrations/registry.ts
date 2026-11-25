import { ProviderAdapter } from "./types";
import { demoAdapter } from "./demoAdapter";

/**
 * Registro de conectores disponibles. Agrega aquí cada nuevo adapter que
 * implementes (ver types.ts para las instrucciones completas).
 *
 * Ejemplo, cuando tengas el conector de Claro listo:
 *   import { claroAdapter } from "./claroAdapter";
 *   export const PROVIDER_ADAPTERS: Record<string, ProviderAdapter> = {
 *     demo: demoAdapter,
 *     claro: claroAdapter,
 *   };
 */
export const PROVIDER_ADAPTERS: Record<string, ProviderAdapter> = {
  demo: demoAdapter,
};

export function getAdapter(slug: string | null | undefined): ProviderAdapter | null {
  if (!slug) return null;
  return PROVIDER_ADAPTERS[slug] ?? null;
}

export const ADAPTER_OPTIONS = Object.values(PROVIDER_ADAPTERS).map((a) => ({
  slug: a.slug,
  label: a.label,
}));
