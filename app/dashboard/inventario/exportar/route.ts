import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const params = request.nextUrl.searchParams;

  const estado = params.get("estado") || undefined;
  const proveedor = params.get("proveedor") || undefined;
  const cliente = params.get("cliente") || undefined;
  const planUnidad = params.get("plan_unidad") || undefined;
  const tipoPlan = params.get("tipo_plan") || undefined;
  const precioMin = params.get("precio_min") || undefined;
  const precioMax = params.get("precio_max") || undefined;

  let query = supabase
    .from("sim_current_view")
    .select("*")
    .order("created_at", { ascending: false });

  if (estado) query = query.eq("estado_actual", estado);
  if (proveedor) query = query.eq("proveedor", proveedor);
  if (cliente) query = query.ilike("cliente_actual", `%${cliente}%`);
  if (planUnidad) query = query.eq("plan_unidad", planUnidad);
  if (tipoPlan) query = query.eq("tipo_plan", tipoPlan);
  if (precioMin) query = query.gte("precio_cliente", Number(precioMin));
  if (precioMax) query = query.lte("precio_cliente", Number(precioMax));

  const { data: sims, error } = await query;
  if (error) {
    return new Response(`No se pudo generar el archivo: ${error.message}`, { status: 500 });
  }

  // Nombres completos de comercial/broker (sim_current_view ya los trae)
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Inventario");

  const columns = [
    { header: "ICC", key: "icc", width: 22 },
    { header: "Proveedor", key: "proveedor", width: 16 },
    { header: "N° corto", key: "numero_corto", width: 14 },
    { header: "APN", key: "apn", width: 22 },
    { header: "Estado", key: "estado", width: 20 },
    { header: "Estado desde", key: "estado_desde", width: 14 },
    { header: "Cliente", key: "cliente", width: 26 },
    { header: "Plan cantidad", key: "plan_cantidad", width: 14 },
    { header: "Plan unidad", key: "plan_unidad", width: 12 },
    { header: "Tipo de plan", key: "tipo_plan", width: 14 },
    { header: "Forma de pago", key: "pago_momento", width: 16 },
    { header: "Precio", key: "precio", width: 12 },
    { header: "Comercial", key: "comercial", width: 20 },
    { header: "Broker", key: "broker", width: 20 },
    { header: "Fecha de entrega", key: "fecha_entrega", width: 16 },
    { header: "Observaciones", key: "observaciones", width: 30 },
  ];
  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF242307" } };

  for (const sim of sims ?? []) {
    sheet.addRow({
      icc: sim.icc,
      proveedor: sim.proveedor,
      numero_corto: sim.numero_corto_actual ?? "",
      apn: sim.apn ?? "",
      estado: sim.estado_actual ?? "",
      estado_desde: sim.estado_desde ? new Date(sim.estado_desde).toLocaleDateString("es-CO") : "",
      cliente: sim.cliente_actual ?? "",
      plan_cantidad: sim.plan_cantidad ?? "",
      plan_unidad: sim.plan_unidad ?? "",
      tipo_plan: sim.tipo_plan ?? "",
      pago_momento: sim.pago_momento ?? "",
      precio: sim.precio_cliente ?? "",
      comercial: sim.comercial_nombre ?? "",
      broker: sim.broker_nombre ?? "",
      fecha_entrega: sim.fecha_entrega ? new Date(sim.fecha_entrega).toLocaleDateString("es-CO") : "",
      observaciones: sim.observaciones ?? "",
    });
  }

  // Hoja con el resumen de filtros aplicados
  const filtros: [string, string][] = [];
  if (estado) filtros.push(["Estado", estado]);
  if (proveedor) filtros.push(["Proveedor", proveedor]);
  if (cliente) filtros.push(["Cliente contiene", cliente]);
  if (planUnidad) filtros.push(["Unidad de plan", planUnidad]);
  if (tipoPlan) filtros.push(["Tipo de plan", tipoPlan]);
  if (precioMin) filtros.push(["Precio mínimo", precioMin]);
  if (precioMax) filtros.push(["Precio máximo", precioMax]);

  if (filtros.length > 0) {
    const sheetFiltros = workbook.addWorksheet("Filtros aplicados");
    sheetFiltros.columns = [{ header: "Filtro", width: 20 }, { header: "Valor", width: 24 }];
    sheetFiltros.getRow(1).font = { bold: true };
    for (const [k, v] of filtros) sheetFiltros.addRow([k, v]);
    sheetFiltros.addRow([]);
    sheetFiltros.addRow(["Total de SIM exportadas", sims?.length ?? 0]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const fecha = new Date().toISOString().slice(0, 10);

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="inventario-nettz-${fecha}.xlsx"`,
    },
  });
}
