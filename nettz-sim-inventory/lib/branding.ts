/**
 * CONFIGURACIÓN DE MARCA (WHITE LABEL)
 * -------------------------------------------------
 * Este es el único archivo que hay que tocar para revender esta plataforma
 * a otro cliente con su propia marca:
 *
 * 1. Reemplaza los archivos en /public/brand/ por los logos del nuevo cliente
 *    (mismos nombres de archivo, o actualiza las rutas abajo).
 * 2. Cambia `name` y `tagline`.
 * 3. Si el cliente tiene sus propios colores, ajusta los tokens en
 *    app/globals.css (--ink-900, --chip-gold, etc.) — son los únicos
 *    lugares donde vive el color de marca.
 *
 * Nada más en el código hace referencia a "Nettz" directamente.
 */
export const BRAND = {
  name: "Nettz",
  tagline: "Inventario de SIM cards",
  logoFull: "/brand/logo-full-white.png", // logo completo, para fondos oscuros (sidebar, login)
  logoFullColor: "/brand/logo-full-color.png", // versión a color, para fondos claros
  mark: "/brand/mark-white.png", // solo el ícono, para espacios pequeños
  footer: `© ${new Date().getFullYear()} Nettz.co`,

  // Versionado del software (no confundir con la marca del cliente que use
  // la plataforma — esto identifica el software en sí).
  productName: "Nettz Inventory",
  productVersion: "1.0",
  creator: "Mario Diaz",
  location: "Bogotá, Colombia",
};
