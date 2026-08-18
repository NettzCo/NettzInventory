"use server";

import { getCurrentProfile } from "@/lib/currentProfile";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { tieneModulo } from "@/lib/modules";
import { encontrarClienteSimilar } from "@/lib/textMatch";
import { INDUSTRIAS, Industria } from "@/lib/types";

async function requireAccesoClientes() {
  const { userId, profile } = await getCurrentProfile();
  if (!tieneModulo(profile, "clientes")) {
    throw new Error("No tienes permiso para gestionar clientes.");
  }
  return { userId, organizationId: profile.organization_id };
}

function normalizarIndustria(valor: string): Industria | null {
  const limpio = valor.trim().toUpperCase();
  const match = INDUSTRIAS.find((i) => i === limpio);
  return match ?? null;
}

export interface ClienteInput {
  nombre: string;
  contacto_responsable: string;
  documento: string;
  telefono: string;
  correo: string;
  direccion: string;
  industria: string; // "" = sin especificar
  fecha_vinculacion: string; // "" = sin especificar, formato yyyy-mm-dd
  observaciones: string;
}

function construirFila(organizationId: string, userId: string, input: ClienteInput) {
  return {
    organization_id: organizationId,
    nombre: input.nombre.trim(),
    contacto_responsable: input.contacto_responsable?.trim() || null,
    documento: input.documento?.trim() || null,
    telefono: input.telefono?.trim() || null,
    correo: input.correo?.trim() || null,
    direccion: input.direccion?.trim() || null,
    industria: input.industria ? normalizarIndustria(input.industria) : null,
    fecha_vinculacion: input.fecha_vinculacion?.trim() || null,
    observaciones: input.observaciones?.trim() || null,
    created_by: userId,
  };
}

export async function crearCliente(input: ClienteInput) {
  const { userId, organizationId } = await requireAccesoClientes();
  if (!input.nombre.trim()) return { error: "El nombre del cliente es obligatorio." };
  if (input.industria && !normalizarIndustria(input.industria)) {
    return { error: "La industria elegida no es válida." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("clientes").insert(construirFila(organizationId, userId, input));

  if (error) return { error: error.message };

  revalidatePath("/dashboard/clientes");
  return { ok: true };
}

export async function actualizarCliente(id: string, patch: Partial<ClienteInput> & { active?: boolean }) {
  await requireAccesoClientes();
  const supabase = await createClient();

  if (patch.nombre !== undefined && !patch.nombre.trim()) {
    return { error: "El nombre no puede quedar vacío." };
  }

  const patchLimpio: Record<string, unknown> = { ...patch };
  if (patch.industria !== undefined) {
    patchLimpio.industria = patch.industria ? normalizarIndustria(patch.industria) : null;
  }
  if (patch.fecha_vinculacion !== undefined) {
    patchLimpio.fecha_vinculacion = patch.fecha_vinculacion || null;
  }
  if (patch.contacto_responsable !== undefined) patchLimpio.contacto_responsable = patch.contacto_responsable?.trim() || null;
  if (patch.documento !== undefined) patchLimpio.documento = patch.documento?.trim() || null;
  if (patch.telefono !== undefined) patchLimpio.telefono = patch.telefono?.trim() || null;
  if (patch.correo !== undefined) patchLimpio.correo = patch.correo?.trim() || null;
  if (patch.direccion !== undefined) patchLimpio.direccion = patch.direccion?.trim() || null;
  if (patch.observaciones !== undefined) patchLimpio.observaciones = patch.observaciones?.trim() || null;
  if (patch.nombre !== undefined) patchLimpio.nombre = patch.nombre.trim();

  const { error } = await supabase.from("clientes").update(patchLimpio).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/clientes");
  return { ok: true };
}

export async function eliminarCliente(id: string) {
  await requireAccesoClientes();
  const supabase = await createClient();

  const { error } = await supabase.from("clientes").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/clientes");
  return { ok: true };
}

// ---------------------------------------------------------
// CARGA MASIVA
// ---------------------------------------------------------
export interface FilaClienteParseada {
  fila: number;
  nombre: string;
  contacto_responsable: string;
  documento: string;
  telefono: string;
  correo: string;
  direccion: string;
  industria: string;
  fecha_vinculacion: string;
  observaciones: string;
  error?: string;
  clienteSugerido?: string; // si se parece a uno ya existente, para confirmar antes de crear
}

export async function analizarCargaMasivaClientes(formData: FormData) {
  const { organizationId } = await requireAccesoClientes();

  const file = formData.get("file") as File | null;
  if (!file) return { error: "No se recibió ningún archivo." };

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) return { error: "El archivo no tiene ninguna hoja." };

  const supabase = await createClient();
  const { data: existentes } = await supabase
    .from("clientes")
    .select("nombre")
    .eq("organization_id", organizationId);
  const nombresExistentes = (existentes ?? []).map((c) => c.nombre);

  const filas: FilaClienteParseada[] = [];
  const nombresEnEsteArchivo: string[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // encabezado
    const get = (col: number) => String(row.getCell(col).value ?? "").trim();

    const nombre = get(1);
    if (!nombre) return; // fila vacía, se ignora

    const contacto_responsable = get(2);
    const documento = get(3);
    const telefono = get(4);
    const correo = get(5);
    const direccion = get(6);
    const industriaTexto = get(7);
    const fechaCelda = row.getCell(8).value;
    const fecha_vinculacion = fechaCelda instanceof Date
      ? fechaCelda.toISOString().slice(0, 10)
      : String(fechaCelda ?? "").trim();
    const observaciones = get(9);

    let error: string | undefined;
    if (nombre.length < 2) error = "El nombre es muy corto.";
    else if (industriaTexto && !normalizarIndustria(industriaTexto)) {
      error = `Industria "${industriaTexto}" no es una opción válida.`;
    }

    // Busca coincidencia parecida contra los ya existentes en la base de
    // datos, y también contra otras filas de este mismo archivo (para
    // detectar duplicados dentro de la propia carga).
    const sugerido = encontrarClienteSimilar(nombre, [...nombresExistentes, ...nombresEnEsteArchivo]);
    nombresEnEsteArchivo.push(nombre);

    filas.push({
      fila: rowNumber,
      nombre,
      contacto_responsable,
      documento,
      telefono,
      correo,
      direccion,
      industria: industriaTexto,
      fecha_vinculacion,
      observaciones,
      error,
      clienteSugerido: sugerido && sugerido.toLowerCase() !== nombre.toLowerCase() ? sugerido : undefined,
    });
  });

  if (filas.length === 0) return { error: "El archivo no tiene ninguna fila con datos." };

  return { filas };
}

export async function confirmarCargaMasivaClientes(filas: FilaClienteParseada[]) {
  const { userId, organizationId } = await requireAccesoClientes();
  const supabase = await createClient();

  let creados = 0;
  let omitidos = 0;
  const errores: string[] = [];

  for (const f of filas) {
    if (f.error) { omitidos++; continue; }
    if (!f.nombre.trim()) { omitidos++; continue; }

    const { error } = await supabase.from("clientes").insert(
      construirFila(organizationId, userId, {
        nombre: f.nombre,
        contacto_responsable: f.contacto_responsable,
        documento: f.documento,
        telefono: f.telefono,
        correo: f.correo,
        direccion: f.direccion,
        industria: f.industria,
        fecha_vinculacion: f.fecha_vinculacion,
        observaciones: f.observaciones,
      })
    );

    if (error) errores.push(`Fila ${f.fila} (${f.nombre}): ${error.message}`);
    else creados++;
  }

  revalidatePath("/dashboard/clientes");
  return { creados, omitidos, errores };
}
