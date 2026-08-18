import type { Metadata } from "next";
import { BRAND } from "@/lib/branding";
import "./globals.css";

export const metadata: Metadata = {
  title: `${BRAND.name} · ${BRAND.tagline}`,
  description: `Gestión de inventario y trazabilidad de SIM cards — ${BRAND.name}`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
