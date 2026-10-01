import { getCurrentProfile } from "@/lib/currentProfile";
import { tieneModulo } from "@/lib/modules";
import { listarPagos } from "../actions";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "pagos")) {
    return new Response("No autorizado.", { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const cliente = params.get("cliente") || undefined;
  const icc = params.get("icc") || undefined;
  const fechaDesde = params.get("fecha_desde") || undefined;
  const fechaHasta = params.get("fecha_hasta") || undefined;

  const pagos = await listarPagos({ cliente, icc, fechaDesde, fechaHasta });
  if ("error" in pagos) {
    return new Response(`No se pudo generar el archivo: ${pagos.error}`, { status: 500 });
  }

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Pagos adelantados");

  sheet.columns = [
    { header: "Comprobante", key: "comprobante", width: 20 },
    { header: "Cliente", key: "cliente", width: 28 },
    { header: "Fecha de pago", key: "fecha_pago", width: 16 },
    { header: "ICC", key: "icc", width: 22 },
    { header: "Renovada hasta", key: "renovada_hasta", width: 16 },
    { header: "Valor SIM", key: "valor_sim", width: 14 },
    { header: "Valor total del pago", key: "valor_total", width: 18 },
    { header: "Nota", key: "nota", width: 30 },
    { header: "Comprobante del cliente", key: "comprobante_url", width: 40 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF101010" } };

  for (const p of pagos) {
    if (p.sims.length === 0) {
      sheet.addRow({
        comprobante: p.numero_comprobante,
        cliente: p.cliente_nombre,
        fecha_pago: formatFechaExcel(p.fecha_pago),
        icc: "",
        renovada_hasta: "",
        valor_sim: "",
        valor_total: p.valor_total,
        nota: p.nota ?? "",
        comprobante_url: p.comprobante_archivo_url ?? "",
      });
      continue;
    }
    for (const s of p.sims) {
      sheet.addRow({
        comprobante: p.numero_comprobante,
        cliente: p.cliente_nombre,
        fecha_pago: formatFechaExcel(p.fecha_pago),
        icc: s.icc,
        renovada_hasta: formatFechaExcel(s.fecha_renovado_hasta),
        valor_sim: s.valor,
        valor_total: p.valor_total,
        nota: p.nota ?? "",
        comprobante_url: p.comprobante_archivo_url ?? "",
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const fecha = new Date().toISOString().slice(0, 10);

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="pagos-adelantados-nettz-${fecha}.xlsx"`,
    },
  });
}

function formatFechaExcel(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-CO");
}
