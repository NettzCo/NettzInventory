import { createClient } from "@/lib/supabase/server";
import { calcularAlertas, DIAS_ALERTA_DEFAULT, ESTADOS_ALERTA_DEFAULT } from "@/lib/alerts";
import { SimCurrentView, EstadoSim } from "@/lib/types";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const umbral = params.get("dias") ? Number(params.get("dias")) : DIAS_ALERTA_DEFAULT;
  const proveedor = params.get("proveedor") || undefined;
  const estadosParam = params.getAll("estados") as EstadoSim[];
  const estados = estadosParam.length > 0 ? estadosParam : ESTADOS_ALERTA_DEFAULT;

  const supabase = await createClient();
  const { data: sims } = await supabase.from("sim_current_view").select("*");

  const alertas = calcularAlertas((sims ?? []) as SimCurrentView[], new Set(), { estados, proveedor, umbralDias: umbral });

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Alertas de vencimiento");

  sheet.columns = [
    { header: "ICC", key: "icc", width: 22 },
    { header: "Proveedor", key: "proveedor", width: 16 },
    { header: "Cliente", key: "cliente", width: 26 },
    { header: "Plan cantidad", key: "plan_cantidad", width: 14 },
    { header: "Plan unidad", key: "plan_unidad", width: 12 },
    { header: "Precio", key: "precio", width: 12 },
    { header: "Comercial", key: "comercial", width: 20 },
    { header: "Estado actual", key: "estado_actual", width: 18 },
    { header: "Activa desde", key: "activa_desde", width: 16 },
    { header: "Cumple 1 año", key: "aniversario", width: 16 },
    { header: "Días restantes (negativo = vencida)", key: "dias", width: 30 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF242307" } };

  for (const a of alertas) {
    sheet.addRow({
      icc: a.sim.icc,
      proveedor: a.sim.proveedor,
      cliente: a.sim.cliente_actual ?? "",
      plan_cantidad: a.sim.plan_cantidad ?? "",
      plan_unidad: a.sim.plan_unidad ?? "",
      precio: a.sim.precio_cliente ?? "",
      comercial: a.sim.comercial_nombre ?? "",
      estado_actual: a.sim.estado_actual ?? "",
      activa_desde: new Date(a.fechaActivacion).toLocaleDateString("es-CO"),
      aniversario: new Date(a.fechaAniversario).toLocaleDateString("es-CO"),
      dias: a.diasRestantes,
    });
  }

  const sheetFiltros = workbook.addWorksheet("Filtros aplicados");
  sheetFiltros.columns = [{ header: "Filtro", width: 20 }, { header: "Valor", width: 30 }];
  sheetFiltros.getRow(1).font = { bold: true };
  sheetFiltros.addRow(["Anticipación (días)", umbral]);
  sheetFiltros.addRow(["Proveedor", proveedor ?? "Todos"]);
  sheetFiltros.addRow(["Estados incluidos", estados.join(", ")]);
  sheetFiltros.addRow([]);
  sheetFiltros.addRow(["Total de SIM exportadas", alertas.length]);

  const buffer = await workbook.xlsx.writeBuffer();
  const fecha = new Date().toISOString().slice(0, 10);

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="alertas-vencimiento-nettz-${fecha}.xlsx"`,
    },
  });
}
