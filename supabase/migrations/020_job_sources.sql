-- Job board sync: jobs pulled from companies' public job boards (Greenhouse, Lever, Ashby, SmartRecruiters,
-- Recruitee, Workable). Ocelot adds a board once; the hourly run keeps its jobs in step every 6 hours.
-- Imported jobs apply on the company's own site. Server only: no policies on job_sources.

create table public.job_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  provider text not null check (provider in ('greenhouse', 'lever', 'ashby', 'smartrecruiters', 'recruitee', 'workable')),
  board text not null check (board ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'),
  countries text[] not null default '{VN,SG,TH,MY,ID,PH}', -- import jobs in these countries, or remote for them
  niche_only boolean not null default true,                 -- only marketing, sales and customer success roles
  active boolean not null default true,
  last_synced_at timestamptz,
  last_error text,
  last_seen int,       -- jobs on the board at the last sync
  last_imported int,   -- of those, jobs that passed the filters
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (provider, board),
  constraint job_sources_countries check (array_to_string(countries, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$')
);
alter table public.job_sources enable row level security;
create index job_sources_due on public.job_sources(last_synced_at) where active;

alter table public.jobs drop constraint if exists jobs_source_check;
alter table public.jobs add constraint jobs_source_check check (source in ('employer', 'curated', 'ats'));
alter table public.jobs
  add column source_id uuid references public.job_sources(id) on delete set null,
  add column external_id text;
create unique index jobs_source_external on public.jobs(source_id, external_id) where source_id is not null;
alter table public.jobs add constraint jobs_ats_fields check (source <> 'ats' or (external_id is not null and apply_method = 'external'));

-- Imported jobs belong to the board, so the company's team can't edit what candidates see on them.
-- They can still close one, which the next sync respects until the job leaves the board.
alter table public.jobs add column closed_by_company boolean not null default false;
create or replace function public.guard_ats_job() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') or old.source <> 'ats' then return new; end if;
  if new.status = 'closed' and old.status = 'published' then
    new.closed_by_company := true;
    return new;
  end if;
  raise exception 'This job comes from the company''s job board. Change it there.';
end $$;
create trigger jobs_ats_guard before update on public.jobs for each row execute function public.guard_ats_job();

-- Sources whose 6 hours are up (or never synced), oldest first.
create or replace function public.due_sources(p_limit int default 10, p_now timestamptz default now())
returns setof public.job_sources
language sql stable security definer set search_path = public as $$
  select * from job_sources
  where active and (last_synced_at is null or last_synced_at < p_now - interval '6 hours')
  order by last_synced_at nulls first
  limit p_limit
$$;
revoke execute on function public.due_sources(int, timestamptz) from public, anon, authenticated;
