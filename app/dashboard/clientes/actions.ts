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
  motivoSugerencia?: "nombre" | "documento";
}

// Normaliza un NIT/documento a sus posibles formas equivalentes: quita todo
// lo que no sea dígito (puntos, espacios, guiones), y además genera la
// variante SIN el último dígito, por si ese último dígito es el DV
// (dígito de verificación) que a veces se escribe pegado sin guion.
function normalizarDocumento(doc: string): string[] {
  const soloDigitos = doc.replace(/[^0-9]/g, "");
  if (!soloDigitos) return [];
  const candidatos = new Set<string>([soloDigitos]);
  if (soloDigitos.length > 1) candidatos.add(soloDigitos.slice(0, -1));
  return Array.from(candidatos);
}

export async function analizarCargaMasivaClientes(formData: FormData) {
  const { organizationId } = await requireAccesoClientes();

  const file = formData.get("file") as File | null;
  if (!file) return { error: "No se recibió ningún archivo." };

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.getWorksheet("Clientes") ?? workbook.worksheets[0];
  if (!sheet) return { error: "El archivo no tiene ninguna hoja." };

  const supabase = await createClient();
  const { data: existentes } = await supabase
    .from("clientes")
    .select("nombre, documento")
    .eq("organization_id", organizationId);
  const nombresExistentes = (existentes ?? []).map((c) => c.nombre);

  // Mapa de cada forma posible de un NIT/documento -> nombre del cliente,
  // para poder detectar coincidencias sin importar guiones ni el DV.
  const documentosExistentes = new Map<string, string>();
  for (const c of existentes ?? []) {
    if (!c.documento) continue;
    for (const candidato of normalizarDocumento(c.documento)) {
      documentosExistentes.set(candidato, c.nombre);
    }
  }
  const documentosEnEsteArchivo = new Map<string, string>();

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

    // Primero se compara por documento/NIT (más confiable que el nombre) —
    // ignorando guiones y el dígito de verificación. Si no hay coincidencia
    // ahí, se compara por parecido de nombre como respaldo.
    let clienteSugerido: string | undefined;
    let motivoSugerencia: "nombre" | "documento" | undefined;

    if (documento) {
      const candidatos = normalizarDocumento(documento);
      for (const candidato of candidatos) {
        const coincidencia = documentosExistentes.get(candidato) ?? documentosEnEsteArchivo.get(candidato);
        if (coincidencia) {
          clienteSugerido = coincidencia;
          motivoSugerencia = "documento";
          break;
        }
      }
      for (const candidato of candidatos) {
        if (!documentosEnEsteArchivo.has(candidato)) documentosEnEsteArchivo.set(candidato, nombre);
      }
    }

    if (!clienteSugerido) {
      const sugerido = encontrarClienteSimilar(nombre, [...nombresExistentes, ...nombresEnEsteArchivo]);
      if (sugerido) {
        clienteSugerido = sugerido;
        motivoSugerencia = "nombre";
      }
    }
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
      clienteSugerido,
      motivoSugerencia,
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
