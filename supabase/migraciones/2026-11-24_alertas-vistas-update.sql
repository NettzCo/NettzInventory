-- Permite actualizar las marcas propias de "alerta vista" (antes solo había
-- select/insert/delete, y el upsert fallaba al re-marcar una alerta).
drop policy if exists "update own sim alert reads" on sim_alert_reads;
create policy "update own sim alert reads" on sim_alert_reads for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
notify pgrst, 'reload schema';
