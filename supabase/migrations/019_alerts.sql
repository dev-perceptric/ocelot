-- Milestone 5 part 3: saved-search alerts, the weekly digest and task reminders.
-- The worker calls the app every hour; the app asks these functions what's due and queues the emails.
-- All of them are for the server only.

-- ---------- Saved searches ----------
alter table public.saved_searches
  add column name text not null default 'My search' check (length(trim(name)) between 1 and 80),
  add column checked_at timestamptz not null default now(),
  add constraint saved_searches_filters check (jsonb_typeof(filters) = 'object'),
  add constraint saved_searches_query check (length(query) <= 100);
create index saved_searches_due on public.saved_searches(frequency, checked_at) where frequency <> 'off';
create trigger saved_searches_limit before insert on public.saved_searches for each row execute function public.limit_rows('20');

-- New jobs for one saved search: live, published since it was last checked, best first, at most 10.
-- This runs as the server, which skips the row rules, so it leaves out suspended companies itself.
create or replace function public.alert_jobs(p_search uuid) returns setof public.jobs
language plpgsql stable security definer set search_path = public as $$
declare s saved_searches%rowtype; f jsonb;
begin
  select * into s from saved_searches where id = p_search;
  if not found then return; end if;
  f := s.filters;
  return query
    select j.* from search_jobs(
      q => nullif(s.query, ''),
      workplaces => array(select jsonb_array_elements_text(coalesce(f->'where', '[]'))),
      country => f->>'country', city => f->>'city', category => f->>'category', role => f->>'role',
      seniorities => array(select jsonb_array_elements_text(coalesce(f->'level', '[]'))),
      types => array(select jsonb_array_elements_text(coalesce(f->'type', '[]'))),
      pay_only => coalesce((f->>'pay')::boolean, false)
    ) j
    where j.published_at > s.checked_at and not org_suspended(j.org_id)
    limit 10;
end $$;

-- Saved searches whose daily or weekly time has come (a little early, so the hourly run doesn't drift).
create or replace function public.due_alerts(p_limit int default 200, p_now timestamptz default now())
returns table (id uuid, user_id uuid, email text, name text, query text, filters jsonb, checked_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.user_id, p.email, s.name, s.query, s.filters, s.checked_at
  from saved_searches s join profiles p on p.id = s.user_id
  where p.email is not null
    and ((s.frequency = 'daily' and s.checked_at < p_now - interval '23 hours')
      or (s.frequency = 'weekly' and s.checked_at < p_now - interval '6 days 23 hours'))
  order by s.checked_at
  limit p_limit
$$;

-- ---------- Task reminders ----------
alter table public.tasks add column reminded_at timestamptz;
alter table public.notification_prefs add column task_reminders boolean not null default true;

-- People with undone tasks due today in their own time zone, once it's 8:00 there. Each task is reminded once.
create or replace function public.due_reminders(p_limit int default 500, p_now timestamptz default now())
returns table (user_id uuid, email text, time_zone text, tasks jsonb)
language sql stable security definer set search_path = public as $$
  select t.user_id, p.email, p.time_zone,
    jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'due_at', t.due_at, 'job', i.title) order by t.due_at)
  from tasks t
  join profiles p on p.id = t.user_id
  left join tracker_items i on i.id = t.item_id
  where t.done_at is null and t.reminded_at is null and t.due_at is not null and p.email is not null
    and (t.due_at at time zone p.time_zone)::date = (p_now at time zone p.time_zone)::date
    and extract(hour from p_now at time zone p.time_zone) >= 8
  group by t.user_id, p.email, p.time_zone
  limit p_limit
$$;

-- ---------- Weekly digest ----------
alter table public.notification_prefs add column digest_sent_at timestamptz;

-- People who turned the digest on, once a week, on Monday from 8:00 in their own time zone.
create or replace function public.due_digests(p_limit int default 1000, p_now timestamptz default now())
returns table (user_id uuid, email text)
language sql stable security definer set search_path = public as $$
  select n.user_id, p.email
  from notification_prefs n join profiles p on p.id = n.user_id
  where n.weekly_digest and p.email is not null
    and (n.digest_sent_at is null or n.digest_sent_at < p_now - interval '6 days')
    and extract(isodow from p_now at time zone p.time_zone) = 1
    and extract(hour from p_now at time zone p.time_zone) >= 8
  limit p_limit
$$;

revoke execute on function public.alert_jobs(uuid), public.due_alerts(int, timestamptz), public.due_reminders(int, timestamptz), public.due_digests(int, timestamptz)
  from public, anon, authenticated;
