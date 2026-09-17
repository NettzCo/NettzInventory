import { createClient } from "@/lib/supabase/server";
import { SimCurrentView } from "@/lib/types";

/**
 * Trae TODAS las filas de cualquier consulta, paginando de a 1000.
 *
 * Supabase/PostgREST corta en silencio cualquier `.select()` sin `.range()`
 * explícito a un máximo de filas (1000 por defecto) — sin ningún error ni
 * aviso, simplemente devuelve menos filas de las que en realidad hay. Con
 * miles de SIMs, esto ya causó dos bugs reales: la lista de proveedores del
 * filtro (que solo mostraba Claro, porque las primeras 1000 filas ordenadas
 * alfabéticamente eran todas de Claro) y el mapa de números cortos en uso
 * para la carga masiva (que solo veía los primeros 1000, dejando conflictos
 * sin detectar más allá de esa cantidad).
 *
 * `queryFactory` recibe (desde, hasta) y debe devolver la consulta de
 * Supabase YA CON `.range(desde, hasta)` aplicado — así esta función sirve
 * para cualquier tabla/columnas, no solo sim_current_view.
 */
export async function traerTodasLasFilas<T>(
  queryFactory: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const PAGINA = 1000;
  const todas: T[] = [];
  let desde = 0;

  while (true) {
    const { data, error } = await queryFactory(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    todas.push(...data);
    if (data.length < PAGINA) break; // última página
    desde += PAGINA;
  }

  return todas;
}

/**
 * Trae TODAS las filas de `sim_current_view`, paginando de a 1000.
 *
 * Supabase/PostgREST corta en silencio cualquier `.select()` sin `.range()`
 * explícito a un máximo de filas (1000 por defecto) — sin ningún error ni
 * aviso, simplemente devuelve menos filas de las que en realidad hay. Con
 * inventarios chicos nunca se nota, pero apenas se pasa de esa cantidad
 * (como con una carga masiva grande), cualquier pantalla que cuente o liste
 * SIM directamente con `.select("*")` empieza a mostrar números
 * incompletos — el inicio, las alertas, la campanita del menú, etc.
 *
 * Esta función se usa en todos esos lugares en vez de repetir la
 * paginación cada vez.
 */
export async function traerInventarioCompleto(supabase: Awaited<ReturnType<typeof createClient>>): Promise<SimCurrentView[]> {
  const PAGINA = 1000;
  const todas: SimCurrentView[] = [];
  let desde = 0;

  while (true) {
    const { data } = await supabase.from("sim_current_view").select("*").range(desde, desde + PAGINA - 1);
    if (!data || data.length === 0) break;
    todas.push(...(data as SimCurrentView[]));
    if (data.length < PAGINA) break; // última página
    desde += PAGINA;
  }

  return todas;
}

/**
 * Igual que `traerInventarioCompleto`, pero filtrando en la base de datos
 * solo las SIM Activas + Prepago — que son las únicas relevantes para
 * calcular la campanita de alertas. Se usa en el layout del panel (que se
 * ejecuta en CADA navegación) para no tener que traer el inventario
 * completo una y otra vez solo para contar alertas.
 */
export async function traerSimsPrepagoActivas(supabase: Awaited<ReturnType<typeof createClient>>): Promise<SimCurrentView[]> {
  const PAGINA = 1000;
  const todas: SimCurrentView[] = [];
  let desde = 0;

  while (true) {
    const { data } = await supabase
      .from("sim_current_view")
      .select("*")
      .eq("estado_actual", "Activa")
      .eq("tipo_plan", "Prepago")
      .range(desde, desde + PAGINA - 1);
    if (!data || data.length === 0) break;
    todas.push(...(data as SimCurrentView[]));
    if (data.length < PAGINA) break;
    desde += PAGINA;
  }

  return todas;
}
