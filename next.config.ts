import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Por defecto Next.js solo permite 1MB por llamada a una Server
      // Action — con cargas masivas de miles de filas (de SIM o de
      // clientes), la información ya analizada que se manda de vuelta al
      // confirmar fácilmente supera ese límite, y la llamada falla con un
      // error interno que no dice claramente qué pasó. 10MB da margen de
      // sobra incluso para archivos de 10.000+ filas.
      bodySizeLimit: "10mb",
    },
  },
  // Encabezados de seguridad en cada respuesta — protegen contra ataques
  // comunes desde afuera (alguien que intenta cargar la plataforma dentro
  // de un iframe ajeno para engañar a un usuario -clickjacking-, o que
  // intenta que el navegador "adivine" un tipo de archivo distinto al
  // real). No afectan en nada el funcionamiento normal de la app.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
