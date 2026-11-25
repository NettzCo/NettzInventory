-- 2026-11-24 · Chat: el creador de un grupo (y el super admin) administra sus miembros
-- Seguro de correr varias veces. Corre ANTES de desplegar el código nuevo.

drop policy if exists "manage groups super admin" on chat_groups;
drop policy if exists "insert groups creator" on chat_groups;
drop policy if exists "update groups creator or admin" on chat_groups;
drop policy if exists "delete groups creator or admin" on chat_groups;

-- Cualquier usuario con el módulo de chat puede crear un grupo propio.
create policy "insert groups creator" on chat_groups for insert
  with check (organization_id = current_org_id() and created_by = auth.uid() and tiene_modulo('chat'));
-- Solo el creador o un super administrador pueden renombrarlo o eliminarlo.
create policy "update groups creator or admin" on chat_groups for update
  using (organization_id = current_org_id() and (created_by = auth.uid() or current_role_is_system()))
  with check (organization_id = current_org_id() and (created_by = auth.uid() or current_role_is_system()));
create policy "delete groups creator or admin" on chat_groups for delete
  using (organization_id = current_org_id() and (created_by = auth.uid() or current_role_is_system()));

drop policy if exists "manage group members super admin" on chat_group_members;
drop policy if exists "manage group members creator or admin" on chat_group_members;

create policy "manage group members creator or admin" on chat_group_members for all
  using (exists (
    select 1 from chat_groups g
    where g.id = group_id and g.organization_id = current_org_id()
      and (g.created_by = auth.uid() or current_role_is_system())
  ))
  with check (exists (
    select 1 from chat_groups g
    where g.id = group_id and g.organization_id = current_org_id()
      and (g.created_by = auth.uid() or current_role_is_system())
  ));

notify pgrst, 'reload schema';
