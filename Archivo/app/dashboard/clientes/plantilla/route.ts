import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { tieneModulo } from "@/lib/modules";
import { INDUSTRIAS } from "@/lib/types";

export async function GET() {
  const { profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "clientes")) {
    return new Response("No autorizado.", { status: 403 });
  }

  const supabase = await createClient();
  const { data: usuariosActivos } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("organization_id", profile.organization_id)
    .eq("active", true)
    .order("full_name");
  const nombresUsuarios = Array.from(new Set((usuariosActivos ?? []).map((u) => u.full_name).filter(Boolean)));

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Clientes");

  sheet.columns = [
    { header: "Nombre completo o razón social", key: "nombre", width: 32 },
    { header: "Contacto responsable", key: "contacto_responsable", width: 24 },
    { header: "Documento / NIT", key: "documento", width: 18 },
    { header: "Teléfono", key: "telefono", width: 16 },
    { header: "Correo", key: "correo", width: 26 },
    { header: "Dirección", key: "direccion", width: 30 },
    { header: "Industria", key: "industria", width: 18 },
    { header: "Fecha de vinculación", key: "fecha_vinculacion", width: 18 },
    { header: "Observaciones", key: "observaciones", width: 30 },
    { header: "KAM", key: "kam", width: 22 },
    { header: "BROKER (texto libre)", key: "broker", width: 22 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF242307" } };

  // Fila de ejemplo, para que quede claro el formato
  sheet.addRow({
    nombre: "Ferretería El Tornillo SAS",
    contacto_responsable: "Laura Gómez",
    documento: "900123456-1",
    telefono: "3001234567",
    correo: "contacto@eltornillo.com",
    direccion: "Calle 10 # 5-20, Bogotá",
    industria: "DISTRIBUIDOR",
    fecha_vinculacion: new Date(),
    observaciones: "Cliente mayorista",
    kam: "",
    broker: "",
  });
  sheet.getCell("H2").numFmt = "yyyy-mm-dd";

  // Listas desplegables (industria, KAM, BROKER), filas 2 a 500
  const hojaListas = workbook.addWorksheet("Listas");
  hojaListas.state = "hidden";
  INDUSTRIAS.forEach((ind, i) => {
    hojaListas.getCell(i + 1, 1).value = ind;
  });
  nombresUsuarios.forEach((nombre, i) => {
    hojaListas.getCell(i + 1, 2).value = nombre;
  });

  for (let row = 2; row <= 500; row++) {
    sheet.getCell(`G${row}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`Listas!$A$1:$A$${INDUSTRIAS.length}`],
      showErrorMessage: true,
      errorTitle: "Industria inválida",
      error: "Elige una industria de la lista.",
    };
    if (nombresUsuarios.length > 0) {
      // Solo KAM (columna J) debe ser un usuario registrado — BROKER
      // (columna K) queda libre, sin desplegable.
      sheet.getCell(`J${row}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`Listas!$B$1:$B$${nombresUsuarios.length}`],
        showErrorMessage: true,
        errorTitle: "Usuario inválido",
        error: "Elige un usuario activo de la lista.",
      };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="plantilla-clientes.xlsx"`,
    },
  });
}
