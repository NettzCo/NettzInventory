import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { tieneModulo } from "@/lib/modules";
import { formatFechaHora } from "@/lib/ui";
import { Pedido } from "@/lib/types";

export async function GET() {
  const { profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "pedidos")) {
    return new Response("No autorizado.", { status: 403 });
  }

  const supabase = await createClient();
  const [{ data: pedidos }, { data: usuarios }] = await Promise.all([
    supabase.from("pedidos").select("*").eq("organization_id", profile.organization_id).order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name").eq("organization_id", profile.organization_id),
  ]);

  const nombrePorId = new Map((usuarios ?? []).map((u) => [u.id, u.full_name]));

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
    { header: "Enviado", key: "enviado", width: 18 },
    { header: "Registrado por", key: "registrado_por", width: 20 },
    { header: "Observaciones", key: "observaciones", width: 30 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF242307" } };

  for (const p of (pedidos ?? []) as Pedido[]) {
    sheet.addRow({
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
      enviado: p.enviado_at ? formatFechaHora(p.enviado_at) : "",
      registrado_por: nombrePorId.get(p.created_by) ?? "",
      observaciones: p.observaciones ?? "",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const fecha = new Date().toISOString().slice(0, 10);

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="pedidos-${fecha}.xlsx"`,
    },
  });
}
