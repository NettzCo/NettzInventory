import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/currentProfile";
import {
  SimCurrentView,
  SimCard,
  SimStatusHistory,
  SimShortNumber,
  SimAssignment,
  Profile,
} from "@/lib/types";
import { NextRequest } from "next/server";

function parseTerminos(q: string): string[] {
  return q.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
}

interface EventoPlano {
  icc: string;
  tipo: string;
  fecha: string;
  titulo: string;
  detalle: string;
  usuario: string;
}

export async function GET(request: NextRequest) {
  const { profile } = await getCurrentProfile();
  const params = request.nextUrl.searchParams;
  const tipo = params.get("tipo") === "completa" ? "completa" : "simple";
  const q = params.get("q") ?? "";
  const terminos = parseTerminos(q);

  const supabase = await createClient();
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();

  if (terminos.length === 0) {
    return new Response("No hay términos de búsqueda.", { status: 400 });
  }

  const { data: sims } = await supabase
    .from("sim_current_view")
    .select("*")
    .or(`icc.in.(${terminos.join(",")}),numero_corto_actual.in.(${terminos.join(",")})`);

  const resultados = (sims ?? []) as SimCurrentView[];

  if (tipo === "simple") {
    const sheet = workbook.addWorksheet("Búsqueda rápida");
    sheet.columns = [
      { header: "ICC", key: "icc", width: 22 },
      { header: "Proveedor", key: "proveedor", width: 16 },
      { header: "N° corto", key: "numero_corto", width: 14 },
      { header: "Cliente", key: "cliente", width: 26 },
      { header: "Plan cantidad", key: "plan_cantidad", width: 14 },
      { header: "Plan unidad", key: "plan_unidad", width: 12 },
      { header: "Precio", key: "precio", width: 12 },
      { header: "Estado", key: "estado", width: 20 },
      { header: "Estado desde", key: "estado_desde", width: 14 },
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF242307" } };

    for (const sim of resultados) {
      sheet.addRow({
        icc: sim.icc,
        proveedor: sim.proveedor,
        numero_corto: sim.numero_corto_actual ?? "",
        cliente: sim.cliente_actual ?? "",
        plan_cantidad: sim.plan_cantidad ?? "",
        plan_unidad: sim.plan_unidad ?? "",
        precio: sim.precio_cliente ?? "",
        estado: sim.estado_actual ?? "",
        estado_desde: sim.estado_desde ? new Date(sim.estado_desde).toLocaleDateString("es-CO") : "",
      });
    }
  } else {
    // ---- COMPLETA: una fila por cada evento de la hoja de vida de cada SIM ----
    const simIds = resultados.map((s) => s.id);

    const [{ data: simCards }, { data: statusRows }, { data: shortRows }, { data: assignRows }, { data: profileRows }] =
      await Promise.all([
        supabase.from("sim_cards").select("*").in("id", simIds),
        supabase.from("sim_status_history").select("*").in("sim_id", simIds),
        supabase.from("sim_short_numbers").select("*").in("sim_id", simIds),
        supabase.from("sim_assignments").select("*").in("sim_id", simIds),
        supabase.from("profiles_view").select("*").eq("organization_id", profile.organization_id),
      ]);

    const profiles = (profileRows ?? []) as Profile[];
    const profileMap = new Map(profiles.map((p) => [p.id, p.full_name]));
    const nombreDe = (id: string | null) => (id ? profileMap.get(id) ?? "Usuario" : "—");

    const simCardMap = new Map(((simCards ?? []) as SimCard[]).map((s) => [s.id, s]));
    const iccDe = (simId: string) => simCardMap.get(simId)?.icc ?? "";

    const eventos: EventoPlano[] = [];

    for (const sc of (simCards ?? []) as SimCard[]) {
      eventos.push({
        icc: sc.icc,
        tipo: "Creación",
        fecha: sc.created_at,
        titulo: "SIM registrada en el inventario",
        detalle: `Proveedor: ${sc.proveedor}`,
        usuario: nombreDe(sc.created_by),
      });
    }

    for (const s of (statusRows ?? []) as SimStatusHistory[]) {
      eventos.push({
        icc: iccDe(s.sim_id),
        tipo: "Cambio de estado",
        fecha: s.changed_at,
        titulo: `Estado cambiado a "${s.estado}"`,
        detalle: s.nota ?? "",
        usuario: nombreDe(s.changed_by),
      });
    }

    for (const n of (shortRows ?? []) as SimShortNumber[]) {
      eventos.push({
        icc: iccDe(n.sim_id),
        tipo: "Número corto",
        fecha: n.assigned_at,
        titulo: `Número corto asignado: ${n.numero_corto}`,
        detalle: n.unassigned_at ? `Vigente hasta ${new Date(n.unassigned_at).toLocaleDateString("es-CO")}` : "Vigente",
        usuario: nombreDe(n.assigned_by),
      });
    }

    for (const a of (assignRows ?? []) as SimAssignment[]) {
      eventos.push({
        icc: iccDe(a.sim_id),
        tipo: "Asignación de cliente",
        fecha: a.assigned_at,
        titulo: `Asignada a cliente: ${a.cliente_nombre}`,
        detalle: `${a.plan_cantidad} ${a.plan_unidad} · ${a.tipo_plan} (${a.pago_momento}) · $${a.precio_cliente.toLocaleString("es-CO")} · Comercial: ${nombreDe(a.comercial_id)}${a.broker_id ? " · Broker: " + nombreDe(a.broker_id) : ""}${a.ended_at ? " · Finalizada " + new Date(a.ended_at).toLocaleDateString("es-CO") : " · Vigente"}`,
        usuario: nombreDe(a.created_by),
      });
    }

    // Ordena por ICC y, dentro de cada ICC, cronológicamente
    eventos.sort((x, y) => {
      if (x.icc !== y.icc) return x.icc.localeCompare(y.icc);
      return new Date(x.fecha).getTime() - new Date(y.fecha).getTime();
    });

    const sheet = workbook.addWorksheet("Hoja de vida");
    sheet.columns = [
      { header: "ICC", key: "icc", width: 22 },
      { header: "Tipo de evento", key: "tipo", width: 20 },
      { header: "Fecha", key: "fecha", width: 18 },
      { header: "Descripción", key: "titulo", width: 34 },
      { header: "Detalle", key: "detalle", width: 50 },
      { header: "Usuario", key: "usuario", width: 20 },
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF242307" } };

    for (const ev of eventos) {
      sheet.addRow({
        icc: ev.icc,
        tipo: ev.tipo,
        fecha: new Date(ev.fecha).toLocaleString("es-CO"),
        titulo: ev.titulo,
        detalle: ev.detalle,
        usuario: ev.usuario,
      });
    }

    // Segunda hoja: resumen actual (una fila por SIM), igual que el modo simple
    const resumen = workbook.addWorksheet("Resumen actual");
    resumen.columns = [
      { header: "ICC", key: "icc", width: 22 },
      { header: "Proveedor", key: "proveedor", width: 16 },
      { header: "N° corto", key: "numero_corto", width: 14 },
      { header: "Cliente", key: "cliente", width: 26 },
      { header: "Plan cantidad", key: "plan_cantidad", width: 14 },
      { header: "Plan unidad", key: "plan_unidad", width: 12 },
      { header: "Precio", key: "precio", width: 12 },
      { header: "Estado", key: "estado", width: 20 },
    ];
    resumen.getRow(1).font = { bold: true };
    for (const sim of resultados) {
      resumen.addRow({
        icc: sim.icc,
        proveedor: sim.proveedor,
        numero_corto: sim.numero_corto_actual ?? "",
        cliente: sim.cliente_actual ?? "",
        plan_cantidad: sim.plan_cantidad ?? "",
        plan_unidad: sim.plan_unidad ?? "",
        precio: sim.precio_cliente ?? "",
        estado: sim.estado_actual ?? "",
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const fecha = new Date().toISOString().slice(0, 10);
  const nombreArchivo = `busqueda-${tipo}-nettz-${fecha}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
