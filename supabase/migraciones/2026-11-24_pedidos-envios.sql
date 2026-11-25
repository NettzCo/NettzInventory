-- 2026-11-24 · Pedidos: envíos con varias guías, valor pagado e ICC despachados
-- Seguro de correr varias veces. Si ya corriste 2026-11-24_pedidos-guia-envio.sql,
-- esta migración copia esos datos a la tabla nueva y deja las columnas viejas intactas.
-- Corre ANTES de desplegar el código nuevo.

create table if not exists pedido_envios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  pedido_id uuid not null references pedidos(id) on delete cascade,
  fecha_envio timestamptz not null default now(),
  transportadora text,
  numero_guia text,
  valor_envio numeric check (valor_envio is null or valor_envio >= 0),
  comprobante_url text,
  iccs text[] not null default '{}',   -- ICC de las SIM despachadas en este envío
  created_at timestamptz not null default now(),
  created_by uuid not null references profiles(id)
);

create index if not exists idx_pedido_envios_pedido on pedido_envios (pedido_id);
create index if not exists idx_pedido_envios_org on pedido_envios (organization_id, fecha_envio);
create index if not exists idx_pedido_envios_iccs on pedido_envios using gin (iccs);

alter table pedido_envios enable row level security;

drop policy if exists "read pedido_envios" on pedido_envios;
drop policy if exists "insert pedido_envios" on pedido_envios;
drop policy if exists "update pedido_envios" on pedido_envios;
drop policy if exists "delete pedido_envios" on pedido_envios;

create policy "read pedido_envios" on pedido_envios for select
  using (organization_id = current_org_id());
create policy "insert pedido_envios" on pedido_envios for insert
  with check (organization_id = current_org_id() and tiene_modulo('pedidos'));
create policy "update pedido_envios" on pedido_envios for update
  using (organization_id = current_org_id() and tiene_modulo('pedidos'))
  with check (organization_id = current_org_id() and tiene_modulo('pedidos'));
create policy "delete pedido_envios" on pedido_envios for delete
  using (organization_id = current_org_id() and tiene_modulo('pedidos'));

-- Para que la pantalla de pedidos se actualice en vivo.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pedido_envios') then
    alter publication supabase_realtime add table pedido_envios;
  end if;
end $$;

-- Copia los datos de guía de la migración anterior (si existe), una sola vez.
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'pedidos' and column_name = 'numero_guia') then
    insert into pedido_envios (organization_id, pedido_id, fecha_envio, transportadora, numero_guia, valor_envio, comprobante_url, created_by)
    select p.organization_id, p.id, coalesce(p.enviado_at, now()), p.transportadora, p.numero_guia, p.valor_envio, p.comprobante_url, coalesce(p.enviado_by, p.created_by)
    from pedidos p
    where (p.numero_guia is not null or p.transportadora is not null or p.valor_envio is not null)
      and not exists (select 1 from pedido_envios e where e.pedido_id = p.id);
  end if;
end $$;

-- Carpeta donde se guardan las guías / comprobantes (puede faltar en la base).
insert into storage.buckets (id, name, public)
values ('pedidos-comprobantes', 'pedidos-comprobantes', true)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
