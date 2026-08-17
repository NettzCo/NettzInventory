// Los roles ahora son administrables (tabla "roles"), no un enum fijo.
export type Role = string;

export interface RoleRow {
  id: string;
  name: string;
  is_system: boolean;
  can_manage_organizations: boolean;
  default_modulos: string[];
  created_at: string;
}

export type EstadoSim =
  | "Inactiva"
  | "Lista para activar"
  | "Activa"
  | "Desactivada temporal"
  | "Desactivada";

export const ESTADOS_SIM: EstadoSim[] = [
  "Inactiva",
  "Lista para activar",
  "Activa",
  "Desactivada temporal",
  "Desactivada",
];

export type PlanUnidad = "Megas" | "Gigas";
export type TipoPlan = "Prepago" | "Postpago";
export type PagoMomento = "Anticipado" | "Mes vencido";

export const PLAN_UNIDADES: PlanUnidad[] = ["Megas", "Gigas"];
export const TIPOS_PLAN: TipoPlan[] = ["Prepago", "Postpago"];
export const PAGOS_MOMENTO: PagoMomento[] = ["Anticipado", "Mes vencido"];

export interface Organization {
  id: string;
  name: string;
  logo_url: string | null;
  color_ink: string;
  color_accent: string;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  organization_id: string;
  role_id: string;
  role_nombre: string;
  role_es_sistema: boolean;
  puede_gestionar_organizaciones: boolean;
  org_nombre: string;
  org_logo_url: string | null;
  org_color_ink: string;
  org_color_accent: string;
  modulos: string[];
  active: boolean;
  created_at: string;
}

export interface Cliente {
  id: string;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  observaciones: string | null;
  active: boolean;
  created_at: string;
  created_by: string;
}

export interface Provider {
  id: string;
  name: string;
  active: boolean;
  integration_slug: string | null;
  api_enabled: boolean;
  api_base_url: string | null;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_message: string | null;
  created_at: string;
}

export interface Apn {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface SimCard {
  id: string;
  organization_id: string;
  icc: string;
  proveedor: string;
  apn: string | null;
  observaciones: string | null;
  created_at: string;
  created_by: string;
}

export interface SimShortNumber {
  id: string;
  sim_id: string;
  numero_corto: string;
  assigned_at: string;
  unassigned_at: string | null;
  assigned_by: string;
}

export interface SimStatusHistory {
  id: string;
  sim_id: string;
  estado: EstadoSim;
  changed_at: string;
  changed_by: string;
  nota: string | null;
}

export interface SimAssignment {
  id: string;
  sim_id: string;
  cliente_nombre: string;
  plan_unidad: PlanUnidad;
  plan_cantidad: number;
  tipo_plan: TipoPlan;
  pago_momento: PagoMomento;
  precio_cliente: number;
  comercial_id: string;
  broker_id: string | null;
  fecha_entrega: string;
  assigned_at: string;
  ended_at: string | null;
  created_by: string;
}

export interface SimCurrentView {
  id: string;
  icc: string;
  proveedor: string;
  apn: string | null;
  observaciones: string | null;
  created_at: string;
  numero_corto_actual: string | null;
  numero_corto_desde: string | null;
  estado_actual: EstadoSim | null;
  estado_desde: string | null;
  cliente_actual: string | null;
  plan_unidad: PlanUnidad | null;
  plan_cantidad: number | null;
  tipo_plan: TipoPlan | null;
  pago_momento: PagoMomento | null;
  precio_cliente: number | null;
  comercial_id: string | null;
  comercial_nombre: string | null;
  broker_id: string | null;
  broker_nombre: string | null;
  fecha_entrega: string | null;
  cliente_desde: string | null;
}

// Un evento genérico para pintar la "hoja de vida" en orden cronológico
export interface HojaDeVidaEvento {
  tipo: "creacion" | "estado" | "numero_corto" | "asignacion";
  fecha: string;
  titulo: string;
  detalle: string;
  usuario_nombre: string;
}

export interface ChatMessage {
  id: string;
  organization_id: string;
  sender_id: string;
  recipient_id: string | null; // null = canal general
  body: string;
  created_at: string;
}
