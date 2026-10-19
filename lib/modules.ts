import { Profile } from "./types";

/**
 * Todo módulo "activable" por usuario individual. "Configuración" NO está
 * aquí a propósito: siempre queda reservado exclusivamente al super
 * administrador (el rol marcado como "de sistema"), sin excepción, porque
 * ahí se gestionan usuarios, roles y credenciales.
 */
export const MODULOS = [
  { key: "inventario", label: "Inventario" }, // incluye Búsqueda rápida y Registrar entrega
  { key: "alertas", label: "Alertas" },
  { key: "clientes", label: "Clientes" },
  { key: "pedidos", label: "Pedidos" },
  { key: "chat", label: "Chat" },
  { key: "reportes", label: "Reportes" },
] as const;

export type ModuloKey = (typeof MODULOS)[number]["key"];

export const MODULO_KEYS: ModuloKey[] = MODULOS.map((m) => m.key);

/** El super administrador (rol "de sistema") siempre tiene acceso a todo,
 * sin importar la lista de módulos guardada. */
export function tieneModulo(profile: { role_es_sistema: boolean; modulos: string[] | null }, modulo: ModuloKey): boolean {
  if (profile.role_es_sistema) return true;
  return (profile.modulos ?? []).includes(modulo);
}

export function esSuperAdmin(profile: Pick<Profile, "role_es_sistema">): boolean {
  return profile.role_es_sistema;
}
