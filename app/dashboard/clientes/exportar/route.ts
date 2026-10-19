import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { tieneModulo } from "@/lib/modules";
import { formatCodigoCliente, formatFecha } from "@/lib/ui";
import { Cliente } from "@/lib/types";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "clientes")) {
    return new Response("No autorizado.", { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const estado = params.get("estado") || ""; // "" = todos, "activo", "inactivo"
  const desde = params.get("desde") || "";
  const hasta = params.get("hasta") || "";

  const supabase = await createClient();
  let query = supabase
    .from("clientes")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .order("codigo");

  if (estado === "activo") query = query.eq("active", true);
  if (estado === "inactivo") query = query.eq("active", false);
  if (desde) query = query.gte("created_at", desde);
  if (hasta) query = query.lte("created_at", `${hasta}T23:59:59`);

  const { data: clientes } = await query;

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Clientes");

  sheet.columns = [
    { header: "Código", key: "codigo", width: 12 },
    { header: "Nombre completo o razón social", key: "nombre", width: 32 },
    { header: "Contacto responsable", key: "contacto_responsable", width: 24 },
    { header: "Documento / NIT", key: "documento", width: 18 },
    { header: "Teléfono", key: "telefono", width: 16 },
    { header: "Correo", key: "correo", width: 26 },
    { header: "Dirección", key: "direccion", width: 30 },
    { header: "Industria", key: "industria", width: 18 },
    { header: "Fecha de vinculación", key: "fecha_vinculacion", width: 18 },
    { header: "Observaciones", key: "observaciones", width: 30 },
    { header: "Estado", key: "estado", width: 12 },
    { header: "Registrado", key: "registrado", width: 14 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF242307" } };

  for (const c of (clientes ?? []) as Cliente[]) {
    sheet.addRow({
      codigo: formatCodigoCliente(c.codigo),
      nombre: c.nombre,
      contacto_responsable: c.contacto_responsable ?? "",
      documento: c.documento ?? "",
      telefono: c.telefono ?? "",
      correo: c.correo ?? "",
      direccion: c.direccion ?? "",
      industria: c.industria ?? "",
      fecha_vinculacion: c.fecha_vinculacion ? formatFecha(c.fecha_vinculacion) : "",
      observaciones: c.observaciones ?? "",
      estado: c.active ? "Activo" : "Inactivo",
      registrado: formatFecha(c.created_at),
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const fecha = new Date().toISOString().slice(0, 10);

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="clientes-${profile.org_nombre.toLowerCase().replace(/\s+/g, "-")}-${fecha}.xlsx"`,
    },
  });
}
