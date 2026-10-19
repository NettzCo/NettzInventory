import { NextRequest, NextResponse } from "next/server";
import { sincronizarSimpro } from "@/lib/integrations/simpro/sync";

export const maxDuration = 300; // hasta 5 min — sincronizar muchas SIM puede tardar

/**
 * Disparado por Vercel Cron (ver vercel.json). Vercel agrega automáticamente
 * el header `Authorization: Bearer $CRON_SECRET` en sus llamadas — se
 * verifica acá para que nadie más pueda disparar la sincronización llamando
 * a esta URL directamente.
 *
 * Necesita estas variables de entorno además de SIMPRO_API_CLIENT /
 * SIMPRO_API_KEY:
 *  - CRON_SECRET: cualquier string secreto, el mismo que se configura en
 *    Vercel → Settings → Environment Variables.
 *  - SIMPRO_ORGANIZATION_ID: el id de la organización de Nettz a
 *    sincronizar (por ahora la integración sincroniza una sola).
 *  - SIMPRO_SYNC_USER_ID: el id de un usuario real (idealmente el super
 *    administrador) al que se le atribuyen los cambios automáticos en la
 *    hoja de vida de cada SIM.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const organizationId = process.env.SIMPRO_ORGANIZATION_ID;
  const userId = process.env.SIMPRO_SYNC_USER_ID;
  if (!organizationId || !userId) {
    return NextResponse.json(
      { error: "Faltan SIMPRO_ORGANIZATION_ID y/o SIMPRO_SYNC_USER_ID en las variables de entorno." },
      { status: 500 }
    );
  }

  const resultado = await sincronizarSimpro(organizationId, "cron", userId);
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 500 });
}
