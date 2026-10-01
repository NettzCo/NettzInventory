import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import { tieneModulo } from "@/lib/modules";
import { formatFecha, formatMoneda } from "@/lib/ui";
import { obtenerPagoParaComprobante } from "../../actions";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "pagos")) {
    return new Response("No autorizado.", { status: 403 });
  }

  const pago = await obtenerPagoParaComprobante(id);
  if ("error" in pago) {
    return new Response(pago.error, { status: 404 });
  }

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("name, logo_url, color_ink")
    .eq("id", profile.organization_id)
    .maybeSingle();

  const pdfDoc = await PDFDocument.create();
  let paginaActual = pdfDoc.addPage([612, 792]); // carta
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const inkHex = (org?.color_ink || "#101010").replace("#", "");
  const ink = rgb(
    parseInt(inkHex.slice(0, 2), 16) / 255,
    parseInt(inkHex.slice(2, 4), 16) / 255,
    parseInt(inkHex.slice(4, 6), 16) / 255
  );
  const gris = rgb(0.45, 0.45, 0.43);
  const grisClaro = rgb(0.88, 0.87, 0.83);

  let y = 740;
  const margenIzq = 56;
  const anchoUtil = 612 - margenIzq * 2;

  // ---- Logo (si existe) ----
  let xTexto = margenIzq;
  if (org?.logo_url) {
    try {
      const resLogo = await fetch(org.logo_url);
      if (resLogo.ok) {
        const bytes = await resLogo.arrayBuffer();
        const tipo = org.logo_url.toLowerCase();
        const imagen = tipo.includes(".png")
          ? await pdfDoc.embedPng(bytes)
          : await pdfDoc.embedJpg(bytes);
        const alturaLogo = 42;
        const anchoLogo = (imagen.width / imagen.height) * alturaLogo;
        paginaActual.drawImage(imagen, { x: margenIzq, y: y - alturaLogo + 10, width: anchoLogo, height: alturaLogo });
        xTexto = margenIzq + anchoLogo + 16;
      }
    } catch {
      // si el logo no carga, el comprobante sigue sin él — no debe romper la descarga
    }
  }

  paginaActual.drawText(org?.name || "Nettz", { x: xTexto, y: y - 4, size: 16, font: fontBold, color: ink });
  paginaActual.drawText("Comprobante de pago adelantado", { x: xTexto, y: y - 22, size: 10, font: fontRegular, color: gris });

  // ---- Número de comprobante, arriba a la derecha ----
  const numTexto = pago.numero_comprobante;
  const numAncho = fontBold.widthOfTextAtSize(numTexto, 14);
  paginaActual.drawText(numTexto, { x: 612 - margenIzq - numAncho, y: y - 4, size: 14, font: fontBold, color: ink });
  const fechaEmisionTexto = `Emitido: ${formatFecha(new Date().toISOString())}`;
  const fechaAncho = fontRegular.widthOfTextAtSize(fechaEmisionTexto, 9);
  paginaActual.drawText(fechaEmisionTexto, { x: 612 - margenIzq - fechaAncho, y: y - 20, size: 9, font: fontRegular, color: gris });

  y -= 56;
  paginaActual.drawLine({ start: { x: margenIzq, y }, end: { x: 612 - margenIzq, y }, thickness: 1, color: grisClaro });
  y -= 28;

  // ---- Datos del pago ----
  function campo(label: string, valor: string, yPos: number) {
    paginaActual.drawText(label.toUpperCase(), { x: margenIzq, y: yPos, size: 8, font: fontBold, color: gris });
    paginaActual.drawText(valor, { x: margenIzq, y: yPos - 14, size: 11, font: fontRegular, color: ink });
  }

  campo("Cliente", pago.cliente_nombre, y);
  paginaActual.drawText("FECHA DE PAGO", { x: margenIzq + anchoUtil / 2, y, size: 8, font: fontBold, color: gris });
  paginaActual.drawText(formatFecha(pago.fecha_pago), { x: margenIzq + anchoUtil / 2, y: y - 14, size: 11, font: fontRegular, color: ink });

  y -= 44;
  paginaActual.drawText("VALOR TOTAL PAGADO", { x: margenIzq, y, size: 8, font: fontBold, color: gris });
  paginaActual.drawText(formatMoneda(pago.valor_total), { x: margenIzq, y: y - 18, size: 20, font: fontBold, color: ink });

  if (pago.nota) {
    paginaActual.drawText("NOTA", { x: margenIzq + anchoUtil / 2, y, size: 8, font: fontBold, color: gris });
    paginaActual.drawText(pago.nota.slice(0, 70), { x: margenIzq + anchoUtil / 2, y: y - 14, size: 10, font: fontRegular, color: ink });
  }

  y -= 50;
  paginaActual.drawLine({ start: { x: margenIzq, y }, end: { x: 612 - margenIzq, y }, thickness: 1, color: grisClaro });
  y -= 24;

  // ---- Tabla de SIM incluidas ----
  paginaActual.drawText("SIM incluidas en este pago", { x: margenIzq, y, size: 12, font: fontBold, color: ink });
  y -= 22;

  const colIcc = margenIzq;
  const colVence = margenIzq + anchoUtil * 0.55;
  const colValor = margenIzq + anchoUtil * 0.78;

  paginaActual.drawText("ICC", { x: colIcc, y, size: 8, font: fontBold, color: gris });
  paginaActual.drawText("RENOVADA HASTA", { x: colVence, y, size: 8, font: fontBold, color: gris });
  paginaActual.drawText("VALOR", { x: colValor, y, size: 8, font: fontBold, color: gris });
  y -= 6;
  paginaActual.drawLine({ start: { x: margenIzq, y }, end: { x: 612 - margenIzq, y }, thickness: 0.5, color: grisClaro });
  y -= 16;

  for (const s of pago.sims) {
    if (y < 90) {
      // si algún día hay muchísimas SIM en un solo pago, se agrega otra página
      paginaActual.drawText("(continúa en la página siguiente)", { x: margenIzq, y: 40, size: 8, font: fontRegular, color: gris });
      paginaActual = pdfDoc.addPage([612, 792]);
      y = 740;
      paginaActual.drawText("ICC", { x: colIcc, y, size: 8, font: fontBold, color: gris });
      paginaActual.drawText("RENOVADA HASTA", { x: colVence, y, size: 8, font: fontBold, color: gris });
      paginaActual.drawText("VALOR", { x: colValor, y, size: 8, font: fontBold, color: gris });
      y -= 22;
    }
    paginaActual.drawText(s.icc, { x: colIcc, y, size: 10, font: fontRegular, color: ink });
    paginaActual.drawText(formatFecha(s.fecha_renovado_hasta), { x: colVence, y, size: 10, font: fontRegular, color: ink });
    paginaActual.drawText(formatMoneda(s.valor), { x: colValor, y, size: 10, font: fontRegular, color: ink });
    y -= 18;
  }

  y -= 10;
  paginaActual.drawLine({ start: { x: margenIzq, y }, end: { x: 612 - margenIzq, y }, thickness: 0.5, color: grisClaro });

  paginaActual.drawText(
    "Este comprobante confirma la recepción del pago indicado arriba. No reemplaza una factura electrónica.",
    { x: margenIzq, y: 50, size: 8, font: fontRegular, color: gris }
  );

  const bytes = await pdfDoc.save();

  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="comprobante-${pago.numero_comprobante}.pdf"`,
    },
  });
}
