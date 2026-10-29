-- Company logos for imported companies. The hourly run finds each company's website from its job board, takes the
-- site's square icon and saves it as the logo. Companies with a logo of their own are never touched.
alter table public.orgs add column logo_checked_at timestamptz;

-- Companies with a job board and no logo, not looked at in the last 30 days. Server only.
create or replace function public.due_logos(p_limit int default 25, p_now timestamptz default now())
returns table (org_id uuid, name text, provider text, board text)
language sql stable security definer set search_path = public as $$
  select distinct on (o.id) o.id, o.name, s.provider, s.board
  from orgs o join job_sources s on s.org_id = o.id
  where o.logo_url is null and (o.logo_checked_at is null or o.logo_checked_at < p_now - interval '30 days')
  order by o.id, s.created_at
  limit p_limit
$$;
revoke execute on function public.due_logos(int, timestamptz) from public, anon, authenticated;
