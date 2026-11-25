import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { tieneModulo } from "@/lib/modules";
import { formatFechaHora, hoyColombia } from "@/lib/ui";
import { Pedido, PedidoEnvio } from "@/lib/types";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "pedidos")) {
    return new Response("No autorizado.", { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const estado = params.get("estado") || ""; // "" = todos
  const desde = params.get("desde") || "";
  const hasta = params.get("hasta") || "";

  const supabase = await createClient();
  let pedidosQuery = supabase
    .from("pedidos")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false });

  if (estado) pedidosQuery = pedidosQuery.eq("estado", estado);
  // Para la relación de envíos (estado Enviado) el rango de fechas aplica a la
  // fecha en que se envió; para los demás estados, a la fecha del pedido.
  const campoFecha = estado === "Enviado" ? "enviado_at" : "created_at";
  if (desde) pedidosQuery = pedidosQuery.gte(campoFecha, desde);
  if (hasta) pedidosQuery = pedidosQuery.lte(campoFecha, `${hasta}T23:59:59`);

  const [{ data: pedidos }, { data: usuarios }] = await Promise.all([
    pedidosQuery,
    supabase.from("profiles").select("id, full_name").eq("organization_id", profile.organization_id),
  ]);

  const nombrePorId = new Map((usuarios ?? []).map((u) => [u.id, u.full_name]));

  const idsPedidos = (pedidos ?? []).map((p) => p.id as string);
  const enviosPorPedido = new Map<string, PedidoEnvio[]>();
  // En bloques, para no exceder el tamaño de la consulta con muchos pedidos.
  for (let i = 0; i < idsPedidos.length; i += 200) {
    const { data: envios } = await supabase
      .from("pedido_envios")
      .select("*")
      .in("pedido_id", idsPedidos.slice(i, i + 200))
      .order("fecha_envio", { ascending: true });
    for (const e of (envios ?? []) as PedidoEnvio[]) {
      enviosPorPedido.set(e.pedido_id, [...(enviosPorPedido.get(e.pedido_id) ?? []), e]);
    }
  }

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Pedidos");

  sheet.columns = [
    { header: "Fecha", key: "fecha", width: 18 },
    { header: "Cliente", key: "cliente", width: 26 },
    { header: "Cantidad", key: "cantidad", width: 10 },
    { header: "Proveedor", key: "proveedor", width: 16 },
    { header: "APN", key: "apn", width: 18 },
    { header: "País", key: "pais", width: 14 },
    { header: "Ciudad", key: "ciudad", width: 14 },
    { header: "Dirección", key: "direccion", width: 30 },
    { header: "Recibe", key: "recibe", width: 20 },
    { header: "Teléfono", key: "telefono", width: 16 },
    { header: "Correo", key: "correo", width: 24 },
    { header: "Asignado a", key: "asignado", width: 20 },
    { header: "Estado", key: "estado", width: 12 },
    { header: "Fecha de envío", key: "enviado", width: 18 },
    { header: "Transportadora", key: "transportadora", width: 18 },
    { header: "N° de guía", key: "numero_guia", width: 18 },
    { header: "Valor envío (COP)", key: "valor_envio", width: 18, style: { numFmt: '"$"#,##0' } },
    { header: "SIM enviadas", key: "cant_iccs", width: 12 },
    { header: "ICC", key: "iccs", width: 40 },
    { header: "Registrado por", key: "registrado_por", width: 20 },
    { header: "Observaciones", key: "observaciones", width: 30 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF242307" } };

  // Una fila por cada envío (guía); los pedidos sin envíos salen en una sola fila.
  for (const p of (pedidos ?? []) as Pedido[]) {
    const base = {
      fecha: formatFechaHora(p.created_at),
      cliente: p.cliente_nombre,
      cantidad: p.cantidad,
      proveedor: p.proveedor,
      apn: p.apn ?? "",
      pais: p.pais,
      ciudad: p.ciudad,
      direccion: p.direccion,
      recibe: p.contacto_nombre,
      telefono: p.contacto_telefono,
      correo: p.contacto_correo ?? "",
      asignado: nombrePorId.get(p.asignado_a) ?? "",
      estado: p.estado,
      registrado_por: nombrePorId.get(p.created_by) ?? "",
      observaciones: p.observaciones ?? "",
    };
    const envios = enviosPorPedido.get(p.id) ?? [];
    if (envios.length === 0) {
      sheet.addRow({ ...base, enviado: p.enviado_at ? formatFechaHora(p.enviado_at) : "" });
      continue;
    }
    for (const e of envios) {
      sheet.addRow({
        ...base,
        enviado: formatFechaHora(e.fecha_envio),
        transportadora: e.transportadora ?? "",
        numero_guia: e.numero_guia ?? "",
        valor_envio: e.valor_envio ?? null,
        cant_iccs: e.iccs.length || "",
        iccs: e.iccs.join(", "),
      });
    }
  }

  // Fila de total para la relación de envíos y el valor pagado.
  const lastRow = sheet.rowCount;
  if (lastRow >= 2) {
    const total = sheet.addRow({ cliente: "TOTAL ENVÍOS", valor_envio: { formula: `SUM(${sheet.getColumn("valor_envio").letter}2:${sheet.getColumn("valor_envio").letter}${lastRow})` } });
    total.font = { bold: true };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const fecha = hoyColombia();

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="pedidos-${fecha}.xlsx"`,
    },
  });
}
