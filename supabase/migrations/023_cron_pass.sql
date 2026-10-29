-- The hourly run's pass. The worker writes a one-time pass with its server key, then calls the app with it; the
-- app checks the pass with its own server key and deletes it. The two apps no longer need the same key format
-- (Supabase has two kinds of server key). Server only: no policies.
create table public.cron_passes (
  token text primary key check (length(token) between 32 and 128),
  created_at timestamptz not null default now()
);
alter table public.cron_passes enable row level security;

-- Takes a pass: true once for a pass made in the last 5 minutes. Old passes are cleared on the way.
create or replace function public.take_cron_pass(p_token text) returns boolean
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  delete from cron_passes where created_at < now() - interval '1 hour';
  delete from cron_passes where token = p_token and created_at > now() - interval '5 minutes' returning true into ok;
  return coalesce(ok, false);
end $$;
revoke execute on function public.take_cron_pass(text) from public, anon, authenticated;

-- When the hourly run last came in, and what it said, for Admin → Job boards.
alter table public.app_settings add column last_cron_at timestamptz, add column last_cron_result text;
