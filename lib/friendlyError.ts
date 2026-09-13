/**
 * Traduce mensajes de error técnicos (de Postgres/Supabase, de red, etc.)
 * a algo que una persona sin conocimientos técnicos pueda entender y saber
 * qué hacer. Se usa en TODOS los lugares donde se le muestra un error a la
 * persona — nunca se le debería mostrar a alguien un mensaje crudo tipo
 * "duplicate key value violates unique constraint" sin traducir.
 *
 * Siempre devuelve algo mostrable; si no reconoce el patrón, da un mensaje
 * genérico pero honesto y dice que puede compartir el detalle técnico con
 * soporte si vuelve a pasar.
 */
export function traducirError(mensajeCrudo: string | null | undefined): string {
  if (!mensajeCrudo) return "Ocurrió un error inesperado. Intenta de nuevo.";
  const m = mensajeCrudo.toLowerCase();

  // Restricciones de la base de datos (Postgres)
  if (m.includes("duplicate key") || m.includes("already exists")) {
    if (m.includes("icc")) return "Ya existe una SIM con ese ICC — no se puede repetir.";
    if (m.includes("numero_corto") || m.includes("short_numbers")) return "Ese número corto ya está en uso por otra SIM.";
    if (m.includes("correo") || m.includes("email")) return "Ya existe una cuenta registrada con ese correo.";
    return "Ya existe un registro con estos mismos datos — no se puede duplicar.";
  }
  if (m.includes("violates foreign key constraint")) {
    return "Uno de los datos hace referencia a algo que no existe o ya fue eliminado (por ejemplo, un comercial, cliente o SIM que ya no está activo).";
  }
  if (m.includes("violates check constraint")) {
    if (m.includes("plan_cantidad")) return "La cantidad del plan debe ser mayor que cero.";
    if (m.includes("precio")) return "El precio no puede ser negativo.";
    return "Uno de los valores no cumple con las reglas del sistema — revisa los números y las opciones elegidas.";
  }
  if (m.includes("violates not-null constraint") || m.includes("null value in column")) {
    return "Falta un dato obligatorio.";
  }
  if (m.includes("invalid input syntax for type date")) {
    return "Una de las fechas no tiene un formato válido.";
  }
  if (m.includes("invalid input syntax for type numeric") || m.includes("invalid input syntax for type integer")) {
    return "Uno de los campos numéricos no contiene un número válido (revisa que no tenga texto, puntos de miles o símbolos).";
  }
  if (m.includes("invalid input syntax for type uuid")) {
    return "Uno de los identificadores internos no es válido — si esto persiste, contacta a soporte.";
  }
  if (m.includes("row-level security") || m.includes("permission denied") || m.includes("new row violates row-level security policy")) {
    return "No tienes permiso para hacer esta acción, o intentaste modificar algo fuera de tu organización.";
  }
  if (m.includes("jwt expired") || m.includes("invalid jwt") || m.includes("invalid token") || m.includes("refresh_token_not_found")) {
    return "Tu sesión expiró. Recarga la página e inicia sesión de nuevo.";
  }

  // Errores de red / infraestructura
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("network request failed")) {
    return "No se pudo conectar con el servidor. Revisa tu conexión a internet e intenta de nuevo.";
  }
  if (m.includes("timeout") || m.includes("timed out") || m.includes("etimedout")) {
    return "La operación tardó demasiado y se canceló. Si estabas cargando muchos datos a la vez, intenta con menos filas por carga.";
  }
  if (m.includes("econnrefused") || m.includes("could not connect")) {
    return "No se pudo conectar con el servicio. Intenta de nuevo en un momento.";
  }
  if (m.includes("payload too large") || m.includes("body exceeded")) {
    return "El archivo es demasiado grande. Intenta con un archivo más chico o divídelo en partes.";
  }

  // Nada reconocido — se devuelve tal cual, pero al menos con una frase
  // introductoria para que no se vea como un mensaje roto del sistema.
  return `No se pudo completar la acción: ${mensajeCrudo}`;
}
