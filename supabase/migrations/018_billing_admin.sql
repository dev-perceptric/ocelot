-- Milestone 5 part 2. The API refuses updates without a where clause, so the switch names its one row.
create or replace function public.set_payments(p_on boolean) returns void
language sql security definer set search_path = public as $$
  update app_settings set payments_on = p_on, updated_at = now() where id
$$;
revoke execute on function public.set_payments(boolean) from public, anon, authenticated;
