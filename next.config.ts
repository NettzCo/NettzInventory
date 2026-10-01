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
};

export default nextConfig;
