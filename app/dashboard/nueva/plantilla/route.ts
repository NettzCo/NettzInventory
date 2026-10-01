import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { ESTADOS_SIM, PLAN_UNIDADES, TIPOS_PLAN, PAGOS_MOMENTO } from "@/lib/types";
import { tieneModulo } from "@/lib/modules";

export async function GET() {
  const { profile } = await getCurrentProfile();
  const supabase = await createClient();

  const [{ data: proveedores }, { data: apns }, { data: perfiles }] = await Promise.all([
    supabase.from("providers").select("name").eq("active", true).order("name"),
    supabase.from("apns").select("name").eq("active", true).order("name"),
    supabase.from("profiles_view").select("full_name, modulos, role_es_sistema").eq("organization_id", profile.organization_id).eq("active", true).order("full_name"),
  ]);

  const nombresProveedores = (proveedores ?? []).map((p) => p.name);
  const nombresApns = (apns ?? []).map((a) => a.name);
  const nombresComerciales = (perfiles ?? [])
    .filter((p) => tieneModulo(p, "inventario"))
    .map((p) => p.full_name);
  const nombresBrokers = (perfiles ?? []).map((p) => p.full_name); // "Broker" es informal: cualquier usuario activo

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();

  // ---------- Hoja oculta con las listas de referencia (fuente de los desplegables) ----------
  const listas = workbook.addWorksheet("Listas", { state: "veryHidden" });
  const columnasListas: { header: string; values: string[] }[] = [
    { header: "proveedores", values: nombresProveedores },
    { header: "apns", values: nombresApns },
    { header: "estados", values: ESTADOS_SIM },
    { header: "unidades", values: PLAN_UNIDADES },
    { header: "tipos_plan", values: TIPOS_PLAN },
    { header: "pagos", values: PAGOS_MOMENTO },
    { header: "comerciales", values: nombresComerciales },
    { header: "brokers", values: nombresBrokers },
  ];
  columnasListas.forEach((col, i) => {
    const letra = String.fromCharCode(65 + i);
    listas.getCell(`${letra}1`).value = col.header;
    col.values.forEach((v, idx) => {
      listas.getCell(`${letra}${idx + 2}`).value = v;
    });
  });

  function rangoLista(nombreColumna: string): string {
    const idx = columnasListas.findIndex((c) => c.header === nombreColumna);
    const letra = String.fromCharCode(65 + idx);
    const cantidad = Math.max(columnasListas[idx].values.length, 1);
    return `Listas!$${letra}$2:$${letra}$${cantidad + 1}`;
  }

  // ---------- Hoja principal ----------
  const sheet = workbook.addWorksheet("Carga masiva");

  const headers = [
    "icc", "proveedor", "numero_corto", "apn", "observaciones", "estado",
    "cliente_nombre", "plan_unidad", "plan_cantidad", "tipo_plan", "pago_momento",
    "precio_cliente", "fecha_entrega", "comercial_correo", "broker_correo",
  ];
  const notas: Record<string, string> = {
    icc: "Obligatorio. Único por SIM, no se puede repetir.",
    proveedor: "Obligatorio. Elige de la lista desplegable.",
    numero_corto: "Obligatorio solo si el proveedor es Claro.",
    apn: "Opcional. Elige de la lista desplegable si aplica.",
    observaciones: "Opcional. Texto libre.",
    estado: "Obligatorio. Elige de la lista desplegable.",
    cliente_nombre: "Obligatorio. Si ya existe un cliente parecido, el sistema te lo va a confirmar antes de guardar.",
    plan_unidad: "Obligatorio. Elige de la lista desplegable.",
    plan_cantidad: "Obligatorio. Número (ej: 10).",
    tipo_plan: "Obligatorio. Elige de la lista desplegable.",
    pago_momento: "Obligatorio. Elige de la lista desplegable.",
    precio_cliente: "Obligatorio. Número, sin puntos ni símbolo de pesos (ej: 25000).",
    fecha_entrega: "Opcional. Si se deja vacía, se usa la fecha de hoy (fecha de creación del registro). Formato AAAA-MM-DD (ej: 2026-08-16).",
    comercial_correo: "Obligatorio. Elige de la lista desplegable (nombre del usuario, no su correo) — usuarios activos con rol comercial o super administrador.",
    broker_correo: "Opcional. Elige de la lista desplegable (nombre del usuario, no su correo) si aplica.",
  };

  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF242307" } };
    const key = headers[colNumber - 1];
    if (notas[key]) cell.note = notas[key];
  });

  const ejemplo = [
    "8957012345678901234", nombresProveedores[0] ?? "Claro", "3001234567", nombresApns[0] ?? "",
    "Cliente demo, entregado en punto físico", "Activa",
    "Ferretería El Tornillo", "Gigas", 10, "Prepago", "Anticipado",
    25000, "2026-08-16", nombresComerciales[0] ?? "", "",
  ];
  const filaEjemplo = sheet.addRow(ejemplo);
  filaEjemplo.eachCell((cell) => { cell.font = { italic: true, color: { argb: "FF808080" } }; });

  const anchos = [22, 18, 14, 22, 30, 20, 26, 12, 14, 12, 16, 16, 14, 24, 22];
  sheet.columns.forEach((col, i) => { col.width = anchos[i]; });
  sheet.views = [{ state: "frozen", ySplit: 2 }];

  // ---------- Validaciones de datos (desplegables) en las filas 2 a 500 ----------
  const colIndex = (key: string) => headers.indexOf(key) + 1;

  // El ICC y el número corto tienen 15-20 dígitos — si Excel los trata como
  // número (en vez de texto), los muestra en notación científica y puede
  // perder dígitos de forma irreversible (los números en Excel solo son
  // exactos hasta 15 cifras). Forzamos la columna completa a formato Texto
  // para que cualquier valor que se escriba ahí quede tal cual, siempre.
  ["icc", "numero_corto"].forEach((key) => {
    const col = sheet.getColumn(colIndex(key));
    col.numFmt = "@";
  });

  function agregarValidacion(key: string, rangoListaKey: string) {
    const col = colIndex(key);
    for (let row = 2; row <= 500; row++) {
      sheet.getCell(row, col).dataValidation = {
        type: "list",
        allowBlank: key === "apn" || key === "broker_correo" || key === "fecha_entrega",
        formulae: [rangoLista(rangoListaKey)],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Valor no reconocido",
        error: "Selecciona un valor de la lista para evitar errores de escritura.",
      };
    }
  }

  agregarValidacion("proveedor", "proveedores");
  agregarValidacion("apn", "apns");
  agregarValidacion("estado", "estados");
  agregarValidacion("plan_unidad", "unidades");
  agregarValidacion("tipo_plan", "tipos_plan");
  agregarValidacion("pago_momento", "pagos");
  agregarValidacion("comercial_correo", "comerciales");
  agregarValidacion("broker_correo", "brokers");

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="plantilla-carga-masiva.xlsx"`,
    },
  });
}
