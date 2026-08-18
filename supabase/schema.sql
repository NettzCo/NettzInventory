-- =========================================================
-- NETTZ INVENTORY · Plataforma multi-organización
-- Esquema completo para Supabase (Postgres)
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- ORGANIZACIONES (multi-tenant). Cada organización es un cliente
-- independiente: su propio logo, sus propios colores, sus propios
-- usuarios, roles, proveedores, clientes e inventario. Solo quien tenga
-- el rol "Super administrador" (marcado is_system) puede ver y crear
-- organizaciones — es el mismo permiso que abre "Configuración".
-- ---------------------------------------------------------
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  logo_url text,
  color_ink text not null default '#242307',   -- color principal (sidebar, botones)
  color_accent text not null default '#a89600', -- color de acento (chips, focos, detalles)
  created_at timestamptz not null default now()
);

insert into organizations (name) values ('Nettz') on conflict (name) do nothing;

-- Bucket público para logos de organización (público = las imágenes se
-- pueden mostrar directamente por URL, sin exponer nada más del proyecto)
insert into storage.buckets (id, name, public)
values ('org-logos', 'org-logos', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------
-- ROLES (administrables por el super administrador de cada organización
-- — se pueden crear, renombrar y eliminar libremente dentro de su propia
-- organización. El único protegido es el marcado como "de sistema": el
-- Super administrador, que cada organización necesita siempre.)
-- ---------------------------------------------------------
create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  is_system boolean not null default false,
  -- Distinto de "is_system": is_system da acceso total DENTRO de su propia
  -- organización. can_manage_organizations es aparte y muchísimo más
  -- restringido — solo lo tiene el rol semilla de Nettz, nunca se marca al
  -- crear una organización nueva, y no se expone en ningún formulario de la
  -- app (ni al crear ni al editar roles). Así, el Super administrador de
  -- una organización nueva tiene control total DENTRO de la suya, pero
  -- nunca ve ni toca las demás organizaciones.
  can_manage_organizations boolean not null default false,
  default_modulos text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

-- Roles por defecto de Nettz (la organización semilla)
insert into roles (organization_id, name, is_system, can_manage_organizations, default_modulos)
select id, 'Super administrador', true, true, array['inventario', 'alertas', 'clientes', 'pedidos', 'chat']
from organizations where name = 'Nettz'
on conflict (organization_id, name) do nothing;

insert into roles (organization_id, name, is_system, default_modulos)
select id, 'Comercial', false, array['inventario', 'alertas', 'clientes', 'pedidos', 'chat']
from organizations where name = 'Nettz'
on conflict (organization_id, name) do nothing;

insert into roles (organization_id, name, is_system, default_modulos)
select id, 'Broker', false, array['inventario', 'alertas', 'pedidos', 'chat']
from organizations where name = 'Nettz'
on conflict (organization_id, name) do nothing;

insert into roles (organization_id, name, is_system, default_modulos)
select id, 'Facturación', false, array['inventario', 'alertas', 'pedidos', 'chat']
from organizations where name = 'Nettz'
on conflict (organization_id, name) do nothing;

-- ---------------------------------------------------------
-- PERFILES (extiende auth.users con rol, organización y nombre)
-- ---------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  organization_id uuid references organizations(id) on delete restrict,
  role_id uuid references roles(id) on delete restrict,
  modulos text[] not null default array['inventario', 'alertas', 'pedidos', 'chat'],
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- role_id/organization_id se dejan nulos un instante al crear el usuario
-- (el trigger de abajo no puede saber a qué organización pertenece); la
-- acción de servidor que crea el usuario los completa inmediatamente
-- después, así que en la práctica nunca quedan así para un usuario real.

-- Vista de perfiles con el nombre/bandera del rol y los datos de la
-- organización ya resueltos, para no repetir el join en cada consulta.
-- security_invoker: las políticas de seguridad de las tablas de abajo se
-- evalúan con los permisos de quien consulta, no del dueño de la vista.
create or replace view profiles_view
with (security_invoker = true) as
select
  p.*,
  r.name as role_nombre,
  r.is_system as role_es_sistema,
  r.can_manage_organizations as puede_gestionar_organizaciones,
  o.name as org_nombre,
  o.logo_url as org_logo_url,
  o.color_ink as org_color_ink,
  o.color_accent as org_color_accent
from profiles p
left join roles r on r.id = p.role_id
left join organizations o on o.id = p.organization_id;

-- Si ya tenías esta plataforma de una versión anterior (sin organizaciones),
-- corre esto una sola vez para migrar todo a la organización "Nettz":
-- alter table roles add column if not exists organization_id uuid references organizations(id);
-- update roles set organization_id = (select id from organizations where name = 'Nettz') where organization_id is null;
-- alter table roles alter column organization_id set not null;
-- alter table roles drop constraint if exists roles_name_key;
-- alter table roles add constraint roles_organization_id_name_key unique (organization_id, name);
-- alter table profiles add column if not exists organization_id uuid references organizations(id);
-- update profiles set organization_id = (select id from organizations where name = 'Nettz') where organization_id is null;
-- alter table providers add column if not exists organization_id uuid references organizations(id);
-- alter table apns add column if not exists organization_id uuid references organizations(id);
-- alter table clientes add column if not exists organization_id uuid references organizations(id);
-- alter table sim_cards add column if not exists organization_id uuid references organizations(id);
-- update providers set organization_id = (select id from organizations where name = 'Nettz') where organization_id is null;
-- update apns set organization_id = (select id from organizations where name = 'Nettz') where organization_id is null;
-- update clientes set organization_id = (select id from organizations where name = 'Nettz') where organization_id is null;
-- update sim_cards set organization_id = (select id from organizations where name = 'Nettz') where organization_id is null;
-- alter table providers alter column organization_id set not null;
-- alter table apns alter column organization_id set not null;
-- alter table clientes alter column organization_id set not null;
-- alter table sim_cards alter column organization_id set not null;

-- Cuando se crea un usuario en auth.users, crear automáticamente su perfil
-- (rol/organización/módulos reales se asignan justo después, desde el
-- panel de administrador o desde "Crear organización")
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ---------------------------------------------------------
-- FUNCIONES DE APOYO PARA LAS POLÍTICAS DE SEGURIDAD
-- (evitan repetir el mismo join en cada política de cada tabla)
-- ---------------------------------------------------------
create or replace function current_org_id() returns uuid
language sql security definer stable as $$
  select organization_id from profiles where id = auth.uid();
$$;

create or replace function current_role_is_system() returns boolean
language sql security definer stable as $$
  select coalesce(
    (select r.is_system from profiles p join roles r on r.id = p.role_id where p.id = auth.uid()),
    false
  );
$$;

create or replace function current_role_can_manage_orgs() returns boolean
language sql security definer stable as $$
  select coalesce(
    (select r.can_manage_organizations from profiles p join roles r on r.id = p.role_id where p.id = auth.uid()),
    false
  );
$$;

create or replace function current_modulos() returns text[]
language sql security definer stable as $$
  select coalesce((select modulos from profiles where id = auth.uid()), array[]::text[]);
$$;

create or replace function tiene_modulo(modulo text) returns boolean
language sql security definer stable as $$
  select current_role_is_system() or modulo = any(current_modulos());
$$;

-- ---------------------------------------------------------
-- PROVEEDORES (administrables por el super administrador de cada organización)
-- ---------------------------------------------------------
create table if not exists providers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  active boolean not null default true,

  -- Integración API (para traer inventario/estado en línea desde el proveedor)
  integration_slug text,
  api_enabled boolean not null default false,
  api_base_url text,
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_message text,

  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

-- ---------------------------------------------------------
-- CREDENCIALES DE API por proveedor (aisladas de "providers"; solo el
-- super administrador de esa organización puede leerlas/escribirlas)
-- ---------------------------------------------------------
create table if not exists provider_credentials (
  provider_id uuid primary key references providers(id) on delete cascade,
  api_key text,
  api_secret text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- BITÁCORA DE SINCRONIZACIÓN (una fila por cada corrida)
-- ---------------------------------------------------------
create table if not exists sync_logs (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('success', 'error', 'partial')),
  records_checked integer default 0,
  records_updated integer default 0,
  records_unmatched integer default 0,
  message text,
  triggered_by uuid references profiles(id)
);

-- ---------------------------------------------------------
-- APN (administrables por el super administrador de cada organización)
-- ---------------------------------------------------------
create table if not exists apns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

-- ---------------------------------------------------------
-- CLIENTES (registro de clientes, por organización; lo administra quien
-- tenga el módulo "clientes"; se usa para autocompletar el campo
-- "cliente" al registrar una entrega)
-- ---------------------------------------------------------
-- ---------------------------------------------------------
-- Contador de códigos correlativos por organización — cada organización
-- tiene su propia numeración empezando en 1. El número solo avanza, nunca
-- retrocede ni se reutiliza, aunque se elimine un cliente.
-- ---------------------------------------------------------
create table if not exists org_counters (
  organization_id uuid primary key references organizations(id) on delete cascade,
  next_codigo_cliente bigint not null default 1
);

create or replace function next_cliente_codigo(p_org uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_codigo bigint;
begin
  insert into org_counters (organization_id, next_codigo_cliente)
  values (p_org, 1)
  on conflict (organization_id) do nothing;

  update org_counters
  set next_codigo_cliente = next_codigo_cliente + 1
  where organization_id = p_org
  returning next_codigo_cliente - 1 into v_codigo;

  return v_codigo;
end;
$$;

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  codigo bigint not null,
  nombre text not null,
  contacto_responsable text,
  documento text,
  telefono text,
  correo text,
  direccion text,
  industria text check (industria in (
    'GPS', 'SEGURIDAD', 'INTEGRADOR', 'DISTRIBUIDOR', 'PAGOS E', 'UTILITIES', 'ENERGIA', 'OTRA INDUSTRIA'
  )),
  fecha_vinculacion date,
  observaciones text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid not null references profiles(id),
  unique (organization_id, codigo)
);

-- Asigna el código correlativo automáticamente al crear un cliente, si no
-- se especifica uno (nunca se debería especificar manualmente)
create or replace function set_cliente_codigo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.codigo is null or new.codigo = 0 then
    new.codigo := next_cliente_codigo(new.organization_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_cliente_codigo on clientes;
create trigger trg_set_cliente_codigo
  before insert on clientes
  for each row execute function set_cliente_codigo();

create index if not exists idx_clientes_nombre on clientes (lower(nombre));
create index if not exists idx_clientes_codigo on clientes (organization_id, codigo);

-- Si ya tenías la tabla "clientes" creada sin el código correlativo, corre
-- esto una sola vez para agregarlo sin perder los clientes existentes:
-- create table if not exists org_counters (
--   organization_id uuid primary key references organizations(id) on delete cascade,
--   next_codigo_cliente bigint not null default 1
-- );
-- create or replace function next_cliente_codigo(p_org uuid) returns bigint
-- language plpgsql as $$
-- declare v_codigo bigint;
-- begin
--   insert into org_counters (organization_id, next_codigo_cliente) values (p_org, 1) on conflict (organization_id) do nothing;
--   update org_counters set next_codigo_cliente = next_codigo_cliente + 1 where organization_id = p_org
--   returning next_codigo_cliente - 1 into v_codigo;
--   return v_codigo;
-- end;
-- $$;
-- alter table clientes add column if not exists codigo bigint;
-- update clientes set codigo = next_cliente_codigo(organization_id) where codigo is null;
-- alter table clientes alter column codigo set not null;
-- alter table clientes add constraint clientes_organization_id_codigo_key unique (organization_id, codigo);
-- create or replace function set_cliente_codigo() returns trigger as $$
-- begin
--   if new.codigo is null or new.codigo = 0 then
--     new.codigo := next_cliente_codigo(new.organization_id);
--   end if;
--   return new;
-- end;
-- $$ language plpgsql;
-- drop trigger if exists trg_set_cliente_codigo on clientes;
-- create trigger trg_set_cliente_codigo before insert on clientes for each row execute function set_cliente_codigo();

-- Si ya tenías la tabla "clientes" creada sin estos campos (contacto
-- responsable, industria, fecha de vinculación), corre esto una sola vez:
-- alter table clientes add column if not exists contacto_responsable text;
-- alter table clientes add column if not exists industria text;
-- alter table clientes add constraint clientes_industria_check check (industria in (
--   'GPS', 'SEGURIDAD', 'INTEGRADOR', 'DISTRIBUIDOR', 'PAGOS E', 'UTILITIES', 'ENERGIA', 'OTRA INDUSTRIA'
-- ));
-- alter table clientes add column if not exists fecha_vinculacion date;

-- ---------------------------------------------------------
-- CHAT (permanente — nunca se borra ni se edita un mensaje una vez
-- enviado; por organización. recipient_id nulo = mensaje al canal
-- general de la organización; con recipient_id = mensaje directo)
-- ---------------------------------------------------------
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  recipient_id uuid references profiles(id),  -- null = mensaje al canal general
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_org_created on chat_messages (organization_id, created_at);
create index if not exists idx_chat_dm on chat_messages (sender_id, recipient_id);

-- ---------------------------------------------------------
-- Marca de "hasta cuándo leíste" cada conversación del chat — para saber
-- qué mensajes generan una alerta pendiente. "conversation" es 'general'
-- para el canal general, o el id del otro usuario para un directo.
-- ---------------------------------------------------------
create table if not exists chat_reads (
  user_id uuid not null references profiles(id) on delete cascade,
  conversation text not null,
  last_read_at timestamptz not null default now(),
  primary key (user_id, conversation)
);
alter table chat_reads enable row level security;
create policy "own chat reads" on chat_reads for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Habilita las actualizaciones en tiempo real del chat (para que los
-- mensajes nuevos aparezcan sin recargar la página)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table chat_messages;
  end if;
end $$;

-- Igual para chat_reads — así la campanita de Alertas se actualiza al
-- instante también cuando se marca algo como leído (por ejemplo, desde otra
-- pestaña abierta con el chat).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_reads'
  ) then
    alter publication supabase_realtime add table chat_reads;
  end if;
end $$;

-- ---------------------------------------------------------
-- SIM CARDS (registro maestro por ICC, por organización — nunca se borra)
-- ---------------------------------------------------------
create table if not exists sim_cards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  icc text not null,
  proveedor text not null,
  apn text,
  observaciones text,
  created_at timestamptz not null default now(),
  created_by uuid not null references profiles(id),
  unique (organization_id, icc)
);

create index if not exists idx_sim_cards_icc on sim_cards (organization_id, icc);

-- ---------------------------------------------------------
-- HISTORIAL DE NÚMERO CORTO
-- ---------------------------------------------------------
create table if not exists sim_short_numbers (
  id uuid primary key default gen_random_uuid(),
  sim_id uuid not null references sim_cards(id) on delete cascade,
  numero_corto text not null,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  assigned_by uuid not null references profiles(id)
);

create index if not exists idx_short_numbers_sim on sim_short_numbers (sim_id);

-- ---------------------------------------------------------
-- HISTORIAL DE ESTADO
-- ---------------------------------------------------------
create table if not exists sim_status_history (
  id uuid primary key default gen_random_uuid(),
  sim_id uuid not null references sim_cards(id) on delete cascade,
  estado text not null check (estado in (
    'Inactiva', 'Lista para activar', 'Activa', 'Desactivada temporal', 'Desactivada'
  )),
  changed_at timestamptz not null default now(),
  changed_by uuid not null references profiles(id),
  nota text
);

create index if not exists idx_status_history_sim on sim_status_history (sim_id);

-- ---------------------------------------------------------
-- HISTORIAL DE ASIGNACIÓN / ENTREGA A CLIENTE
-- ---------------------------------------------------------
create table if not exists sim_assignments (
  id uuid primary key default gen_random_uuid(),
  sim_id uuid not null references sim_cards(id) on delete cascade,

  cliente_nombre text not null,

  plan_unidad text not null check (plan_unidad in ('Megas', 'Gigas')),
  plan_cantidad numeric not null check (plan_cantidad > 0),
  tipo_plan text not null check (tipo_plan in ('Prepago', 'Postpago')),
  pago_momento text not null check (pago_momento in ('Anticipado', 'Mes vencido')),

  precio_cliente numeric not null check (precio_cliente >= 0),

  comercial_id uuid not null references profiles(id),
  broker_id uuid references profiles(id),

  fecha_entrega date not null,

  assigned_at timestamptz not null default now(),
  ended_at timestamptz,

  created_by uuid not null references profiles(id)
);

create index if not exists idx_assignments_sim on sim_assignments (sim_id);
create index if not exists idx_assignments_vigente on sim_assignments (sim_id) where ended_at is null;

-- ---------------------------------------------------------
-- VISTA: estado actual por SIM (para el listado / búsqueda rápida)
-- ---------------------------------------------------------
create or replace view sim_current_view
with (security_invoker = true) as
select
  s.id,
  s.organization_id,
  s.icc,
  s.proveedor,
  s.apn,
  s.observaciones,
  s.created_at,
  sn.numero_corto        as numero_corto_actual,
  sn.assigned_at         as numero_corto_desde,
  st.estado              as estado_actual,
  st.changed_at          as estado_desde,
  a.cliente_nombre       as cliente_actual,
  a.plan_unidad,
  a.plan_cantidad,
  a.tipo_plan,
  a.pago_momento,
  a.precio_cliente,
  a.comercial_id,
  cp.full_name           as comercial_nombre,
  a.broker_id,
  bp.full_name           as broker_nombre,
  a.fecha_entrega,
  a.assigned_at          as cliente_desde
from sim_cards s
left join lateral (
  select * from sim_short_numbers
  where sim_id = s.id and unassigned_at is null
  order by assigned_at desc limit 1
) sn on true
left join lateral (
  select * from sim_status_history
  where sim_id = s.id
  order by changed_at desc limit 1
) st on true
left join lateral (
  select * from sim_assignments
  where sim_id = s.id and ended_at is null
  order by assigned_at desc limit 1
) a on true
left join profiles cp on cp.id = a.comercial_id
left join profiles bp on bp.id = a.broker_id;

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
alter table organizations enable row level security;
alter table profiles enable row level security;
alter table roles enable row level security;
alter table providers enable row level security;
alter table provider_credentials enable row level security;
alter table sync_logs enable row level security;
alter table apns enable row level security;
alter table clientes enable row level security;
alter table org_counters enable row level security;
alter table chat_messages enable row level security;
alter table sim_cards enable row level security;
alter table sim_short_numbers enable row level security;
alter table sim_status_history enable row level security;
alter table sim_assignments enable row level security;

-- Organizaciones: cualquiera puede leer la suya (para su propia marca);
-- solo quien tenga el permiso especial "can_manage_organizations" (el rol
-- semilla de Nettz — nunca se marca en organizaciones nuevas) puede ver y
-- administrar todas. Un Super administrador normal de otra organización
-- NO ve esto, aunque también tenga acceso total dentro de la suya.
create policy "read own organization" on organizations for select
  using (id = current_org_id() or current_role_can_manage_orgs());
create policy "platform manage organizations" on organizations for insert
  with check (current_role_can_manage_orgs());
create policy "platform update organizations" on organizations for update
  using (current_role_can_manage_orgs());

-- Perfiles: se leen dentro de la misma organización (o quien tenga el
-- permiso de gestionar organizaciones puede leer cualquiera)
create policy "read profiles same org" on profiles for select
  using (organization_id = current_org_id() or current_role_can_manage_orgs());
create policy "update own profile" on profiles for update using (auth.uid() = id);

-- Roles: se leen y administran dentro de la misma organización
create policy "read roles same org" on roles for select
  using (organization_id = current_org_id());
create policy "super_admin manage roles" on roles for all
  using (organization_id = current_org_id() and current_role_is_system())
  with check (organization_id = current_org_id() and current_role_is_system());

-- Proveedores y APN: se leen y administran dentro de la misma organización
create policy "read providers same org" on providers for select
  using (organization_id = current_org_id());
create policy "super_admin manage providers" on providers for all
  using (organization_id = current_org_id() and current_role_is_system())
  with check (organization_id = current_org_id() and current_role_is_system());

create policy "read apns same org" on apns for select
  using (organization_id = current_org_id());
create policy "super_admin manage apns" on apns for all
  using (organization_id = current_org_id() and current_role_is_system())
  with check (organization_id = current_org_id() and current_role_is_system());

-- Clientes: se leen y administran dentro de la misma organización, por
-- quien tenga el módulo "clientes" habilitado
create policy "read clientes same org" on clientes for select
  using (organization_id = current_org_id());
create policy "manage clientes" on clientes for all
  using (organization_id = current_org_id() and tiene_modulo('clientes'))
  with check (organization_id = current_org_id() and tiene_modulo('clientes'));

-- Credenciales de API: solo el super administrador de esa organización
create policy "super_admin manage credentials" on provider_credentials for all
  using (exists (select 1 from providers pr where pr.id = provider_id and pr.organization_id = current_org_id() and current_role_is_system()))
  with check (exists (select 1 from providers pr where pr.id = provider_id and pr.organization_id = current_org_id() and current_role_is_system()));

-- Bitácora de sincronización: lectura para la misma organización, escritura para super_admin
create policy "read sync_logs same org" on sync_logs for select
  using (exists (select 1 from providers pr where pr.id = provider_id and pr.organization_id = current_org_id()));
create policy "super_admin write sync_logs" on sync_logs for insert
  with check (exists (select 1 from providers pr where pr.id = provider_id and pr.organization_id = current_org_id() and current_role_is_system()));

-- Chat: permanente, nunca se borra ni se edita (no hay política de update
-- ni de delete — por diseño). Se puede leer el canal general de la
-- organización, o los mensajes directos donde uno es emisor o receptor.
create policy "read chat same org" on chat_messages for select
  using (
    organization_id = current_org_id()
    and (recipient_id is null or recipient_id = auth.uid() or sender_id = auth.uid())
  );
create policy "send chat" on chat_messages for insert
  with check (
    organization_id = current_org_id()
    and sender_id = auth.uid()
    and tiene_modulo('chat')
  );

-- SIM cards y su historial: se leen y administran dentro de la misma
-- organización, por quien tenga el módulo "nueva" habilitado
create policy "read sim_cards same org" on sim_cards for select
  using (organization_id = current_org_id());
create policy "write sim_cards" on sim_cards for insert with check (
  organization_id = current_org_id() and tiene_modulo('inventario')
);
create policy "update sim_cards" on sim_cards for update using (
  organization_id = current_org_id() and tiene_modulo('inventario')
);

create policy "read short_numbers same org" on sim_short_numbers for select
  using (exists (select 1 from sim_cards sc where sc.id = sim_id and sc.organization_id = current_org_id()));
create policy "write short_numbers ins" on sim_short_numbers for insert with check (
  exists (select 1 from sim_cards sc where sc.id = sim_id and sc.organization_id = current_org_id()) and tiene_modulo('inventario')
);
create policy "write short_numbers upd" on sim_short_numbers for update using (
  exists (select 1 from sim_cards sc where sc.id = sim_id and sc.organization_id = current_org_id()) and tiene_modulo('inventario')
);

create policy "read status_history same org" on sim_status_history for select
  using (exists (select 1 from sim_cards sc where sc.id = sim_id and sc.organization_id = current_org_id()));
create policy "write status_history" on sim_status_history for insert with check (
  exists (select 1 from sim_cards sc where sc.id = sim_id and sc.organization_id = current_org_id()) and tiene_modulo('inventario')
);

create policy "read assignments same org" on sim_assignments for select
  using (exists (select 1 from sim_cards sc where sc.id = sim_id and sc.organization_id = current_org_id()));
create policy "write assignments ins" on sim_assignments for insert with check (
  exists (select 1 from sim_cards sc where sc.id = sim_id and sc.organization_id = current_org_id()) and tiene_modulo('inventario')
);
create policy "write assignments upd" on sim_assignments for update using (
  exists (select 1 from sim_cards sc where sc.id = sim_id and sc.organization_id = current_org_id()) and tiene_modulo('inventario')
);

-- Almacenamiento: logos de organización — lectura pública (para poder
-- mostrarlos sin sesión, ej. en el login), escritura solo para super administradores
create policy "org logos public read" on storage.objects for select
  using (bucket_id = 'org-logos');
create policy "platform upload logos" on storage.objects for insert
  with check (bucket_id = 'org-logos' and current_role_can_manage_orgs());
create policy "platform update logos" on storage.objects for update
  using (bucket_id = 'org-logos' and current_role_can_manage_orgs());

-- ---------------------------------------------------------
-- PEDIDOS DE SIM CARDS (cualquier usuario registra un pedido de un cliente
-- y lo asigna a otra persona, por ejemplo un comercial, para que lo envíe)
-- ---------------------------------------------------------
create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  cliente_id uuid references clientes(id),
  cliente_nombre text not null, -- copia del nombre al momento del pedido, por si el cliente cambia después
  cantidad integer not null check (cantidad > 0),
  proveedor text not null,
  apn text,
  pais text not null,
  ciudad text not null,
  direccion text not null,
  contacto_nombre text not null,
  contacto_telefono text not null,
  contacto_correo text,
  asignado_a uuid not null references profiles(id),
  estado text not null default 'Pendiente' check (estado in ('Pendiente', 'Enviado')),
  observaciones text,
  created_at timestamptz not null default now(),
  created_by uuid not null references profiles(id),
  enviado_at timestamptz,
  enviado_by uuid references profiles(id)
);

create index if not exists idx_pedidos_org on pedidos (organization_id, created_at);
create index if not exists idx_pedidos_asignado on pedidos (asignado_a, estado);

alter table pedidos enable row level security;

create policy "read pedidos" on pedidos for select
  using (organization_id = current_org_id());

create policy "insert pedidos" on pedidos for insert
  with check (organization_id = current_org_id() and tiene_modulo('pedidos'));

create policy "update pedidos" on pedidos for update
  using (organization_id = current_org_id() and tiene_modulo('pedidos'))
  with check (organization_id = current_org_id() and tiene_modulo('pedidos'));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pedidos'
  ) then
    alter publication supabase_realtime add table pedidos;
  end if;
end $$;

-- Semilla inicial de proveedores de Nettz (puedes agregar/eliminar desde el panel)
insert into providers (organization_id, name)
select id, p.name
from organizations, (values ('Claro'), ('Claro Gigas'), ('Moabits'), ('Wireless Logic'), ('Tele2'), ('Movistar'), ('Top Connect'), ('Things Data')) as p(name)
where organizations.name = 'Nettz'
on conflict (organization_id, name) do nothing;
