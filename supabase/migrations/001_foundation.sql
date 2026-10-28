-- Ocelot foundation: people, companies, jobs, applications and the candidate's private tracker.
-- Every table has row level security on. Tables with no policy are server only (service role).
-- Two sides never mix: employers reach applications sent to their company; tracker items, notes and tasks
-- belong to the candidate alone.

create extension if not exists pgcrypto;

-- ---------- People ----------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  headline text,
  location text,
  phone text,
  links jsonb not null default '[]',
  preferences jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;

-- A profile for every new account.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Companies ----------

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  website text,
  logo_url text,
  about text,
  locations text[] not null default '{}',
  email_verified_domain text,          -- "Email verified": a member proved a work email on this domain
  business_verified_at timestamptz,    -- "Company verified": an admin checked the business
  trusted boolean not null default false, -- trusted companies can skip review later
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.org_members (
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user on public.org_members(user_id);

-- Security definer so policies on org_members can ask about org_members without looping.
create or replace function public.is_org_member(p_org uuid, p_roles text[] default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_members
    where org_id = p_org and user_id = auth.uid() and (p_roles is null or role = any(p_roles))
  )
$$;

-- Make a company and its first owner in one step.
create or replace function public.create_org(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into orgs (name, slug, created_by) values (trim(p_name), p_slug, auth.uid()) returning id into v_id;
  insert into org_members (org_id, user_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end $$;

-- ---------- Jobs ----------

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(trim(title)) between 1 and 140),
  description text not null default '',
  category text check (category in ('marketing', 'sales', 'customer_success', 'other')),
  seniority text check (seniority in ('intern', 'entry', 'mid', 'senior', 'lead', 'director', 'executive')),
  employment_type text check (employment_type in ('full_time', 'part_time', 'contract', 'temporary', 'internship')),
  workplace text check (workplace in ('on_site', 'hybrid', 'remote')),
  office_locations text[] not null default '{}',   -- where the office is, for on-site and hybrid
  eligible_countries text[] not null default '{}', -- ISO country codes people can be hired from
  time_zones text[] not null default '{}',
  salary_min numeric check (salary_min >= 0),
  salary_max numeric check (salary_max >= 0),
  salary_currency text check (salary_currency ~ '^[A-Z]{3}$'),
  salary_period text check (salary_period in ('hour', 'month', 'year')),
  apply_method text not null default 'ocelot' check (apply_method in ('ocelot', 'external')),
  apply_url text,
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'published', 'closed', 'expired', 'rejected', 'suspended')),
  review_note text,          -- why a listing was sent back
  source text not null default 'employer' check (source in ('employer', 'curated')),
  source_url text,           -- for curated jobs: where it came from
  featured_until timestamptz,
  published_at timestamptz,
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(category, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'C')
  ) stored,
  check (salary_min is null or salary_max is null or salary_min <= salary_max),
  check (apply_method = 'ocelot' or apply_url is not null)
);
create index jobs_search on public.jobs using gin(search);
create index jobs_live on public.jobs(published_at desc) where status = 'published';
create index jobs_org on public.jobs(org_id);

-- Members move a job only along these steps. Publishing, rejecting, suspending and expiring are done by
-- the server (review, payment, the worker), which runs as service_role and skips this check.
create or replace function public.guard_job_update() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if new.org_id <> old.org_id or new.published_at is distinct from old.published_at
     or new.expires_at is distinct from old.expires_at or new.featured_until is distinct from old.featured_until
     or new.review_note is distinct from old.review_note or new.source <> old.source then
    raise exception 'Only Ocelot can change this field';
  end if;
  if new.status <> old.status and not (
       (old.status = 'draft' and new.status = 'pending_review')
    or (old.status = 'pending_review' and new.status = 'draft')
    or (old.status = 'rejected' and new.status = 'draft')
    or (old.status = 'published' and new.status = 'closed')
  ) then
    raise exception 'A job can''t move from % to %', old.status, new.status;
  end if;
  return new;
end $$;
create trigger jobs_guard before update on public.jobs for each row execute function public.guard_job_update();

create table public.job_questions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  position int not null default 0,
  prompt text not null,
  required boolean not null default false
);

-- ---------- Documents (résumés) ----------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  storage_path text not null unique,  -- resumes/<user id>/<file>
  mime_type text not null check (mime_type in ('application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes int not null check (size_bytes between 1 and 5242880),
  created_at timestamptz not null default now()
);

-- ---------- Applications (sent through Ocelot) ----------

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete restrict,
  org_id uuid not null references public.orgs(id) on delete cascade,
  candidate_id uuid not null references auth.users(id) on delete cascade,
  hiring_stage text not null default 'new'
    check (hiring_stage in ('new', 'reviewing', 'interviewing', 'offer', 'hired', 'rejected', 'withdrawn')),
  snapshot jsonb not null default '{}', -- profile and answers as sent; later profile edits never change it
  resume_id uuid references public.documents(id) on delete set null,
  submitted_at timestamptz not null default now(),
  unique (job_id, candidate_id)
);
create index applications_org on public.applications(org_id, hiring_stage);
create index applications_candidate on public.applications(candidate_id);

create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  kind text not null check (kind in ('submitted', 'stage', 'withdrawn', 'message')),
  from_stage text,
  to_stage text,
  visible_to_candidate boolean not null default false,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Private hiring notes. Company members only.
create table public.application_notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------- The candidate's private tracker ----------

create table public.tracker_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,          -- an Ocelot job
  application_id uuid unique references public.applications(id) on delete set null,
  title text not null,
  company text not null default '',
  url text,                                                           -- a job found elsewhere
  location text,
  salary text,
  stage text not null default 'saved'
    check (stage in ('saved', 'applied', 'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn', 'archived')),
  position double precision not null default 0, -- order inside a board column
  contacts jsonb not null default '[]',
  notes text not null default '',
  resume_id uuid references public.documents(id) on delete set null,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tracker_items_user on public.tracker_items(user_id, stage);

create table public.tracker_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.tracker_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid references public.tracker_items(id) on delete cascade,
  title text not null,
  due_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.tracker_items(id) on delete cascade,
  starts_at timestamptz not null,
  meeting_url text,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table public.saved_jobs (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null default '',
  filters jsonb not null default '{}',
  frequency text not null default 'weekly' check (frequency in ('daily', 'weekly', 'off')),
  last_sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Tracker stage changes go on the item's timeline. The employer's hiring stage never touches this.
create or replace function public.log_tracker_stage() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.stage <> old.stage then
    insert into tracker_events (item_id, user_id, kind, detail)
    values (new.id, new.user_id, 'stage', jsonb_build_object('from', old.stage, 'to', new.stage));
    if new.stage = 'applied' and new.applied_at is null then new.applied_at := now(); end if;
  end if;
  return new;
end $$;
create trigger tracker_stage before update on public.tracker_items
  for each row execute function public.log_tracker_stage();

-- Sending an application: log it and put it on the candidate's tracker (link the saved card if there is one).
create or replace function public.after_application() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_item uuid; v_job jobs%rowtype; v_org orgs%rowtype;
begin
  insert into application_events (application_id, kind, to_stage, visible_to_candidate, actor_id)
  values (new.id, 'submitted', 'new', true, new.candidate_id);

  select * into v_job from jobs where id = new.job_id;
  select * into v_org from orgs where id = new.org_id;
  select id into v_item from tracker_items
    where user_id = new.candidate_id and job_id = new.job_id and application_id is null
    order by created_at limit 1;
  if v_item is null then
    insert into tracker_items (user_id, job_id, application_id, title, company, stage, applied_at, resume_id)
    values (new.candidate_id, new.job_id, new.id, v_job.title, v_org.name, 'applied', new.submitted_at, new.resume_id);
  else
    update tracker_items set application_id = new.id, resume_id = coalesce(resume_id, new.resume_id),
      stage = case when stage = 'saved' then 'applied' else stage end
    where id = v_item;
  end if;
  return new;
end $$;
create trigger applications_after_insert after insert on public.applications
  for each row execute function public.after_application();

-- Hiring stage changes are logged. The candidate sees the outcomes that matter to them, never "reviewing".
create or replace function public.log_hiring_stage() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.hiring_stage <> old.hiring_stage then
    insert into application_events (application_id, kind, from_stage, to_stage, visible_to_candidate, actor_id)
    values (new.id, case when new.hiring_stage = 'withdrawn' then 'withdrawn' else 'stage' end,
      old.hiring_stage, new.hiring_stage,
      new.hiring_stage in ('interviewing', 'offer', 'hired', 'rejected', 'withdrawn'), auth.uid());
  end if;
  return new;
end $$;
create trigger applications_stage after update on public.applications
  for each row execute function public.log_hiring_stage();

-- A candidate can withdraw their own application. That is the only change they can make to it.
create or replace function public.withdraw_application(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update applications set hiring_stage = 'withdrawn'
  where id = p_id and candidate_id = auth.uid() and hiring_stage not in ('hired', 'withdrawn');
  if not found then raise exception 'Application not found'; end if;
end $$;

-- ---------- Billing (written by the Stripe webhook only) ----------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete restrict,
  job_id uuid references public.jobs(id) on delete set null,
  package text not null check (package in ('standard', 'featured', 'founding')),
  amount_cents int not null default 0,
  currency text not null default 'USD',
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'failed')),
  stripe_session_id text unique,
  created_at timestamptz not null default now()
);

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  package text not null check (package in ('standard', 'featured', 'founding')),
  job_id uuid references public.jobs(id) on delete set null, -- set when the credit is used
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.stripe_events (
  id text primary key, -- Stripe event id; a repeat delivery hits this key and is skipped
  type text not null,
  received_at timestamptz not null default now()
);

-- ---------- Trust ----------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  job_id uuid references public.jobs(id) on delete cascade,
  org_id uuid references public.orgs(id) on delete cascade,
  reason text not null check (reason in ('scam', 'fee_required', 'misleading', 'expired', 'other')),
  details text not null default '',
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  check (job_id is not null or org_id is not null)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_table text,
  target_id uuid,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------- Background work ----------

create table public.jobs_queue (
  id bigint generated always as identity primary key,
  kind text not null,
  payload jsonb not null default '{}',
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  locked_at timestamptz,
  done_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index jobs_queue_due on public.jobs_queue(run_at) where done_at is null;

-- The worker takes due tasks. A task locked more than 10 minutes ago is taken again (its worker died).
create or replace function public.claim_queue(p_limit int default 10) returns setof public.jobs_queue
language sql security definer set search_path = public as $$
  update jobs_queue set locked_at = now(), attempts = attempts + 1
  where id in (
    select id from jobs_queue
    where done_at is null and run_at <= now() and attempts < 5
      and (locked_at is null or locked_at < now() - interval '10 minutes')
    order by run_at limit p_limit
    for update skip locked
  )
  returning *
$$;

create or replace function public.finish_queue(p_id bigint, p_error text default null) returns void
language sql security definer set search_path = public as $$
  update jobs_queue set
    done_at = case when p_error is null then now() end,
    locked_at = null,
    error = p_error,
    run_at = case when p_error is null then run_at else now() + (interval '1 minute' * power(2, attempts)) end
  where id = p_id
$$;

-- Published jobs past their end date close as expired.
create or replace function public.expire_jobs() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update jobs set status = 'expired' where status = 'published' and expires_at is not null and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Server-only functions: keep them away from signed-in users and visitors.
revoke execute on function public.claim_queue(int), public.finish_queue(bigint, text), public.expire_jobs()
  from public, anon, authenticated;

-- ---------- Row level security ----------

alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.orgs enable row level security;
alter table public.org_members enable row level security;
alter table public.jobs enable row level security;
alter table public.job_questions enable row level security;
alter table public.documents enable row level security;
alter table public.applications enable row level security;
alter table public.application_events enable row level security;
alter table public.application_notes enable row level security;
alter table public.tracker_items enable row level security;
alter table public.tracker_events enable row level security;
alter table public.tasks enable row level security;
alter table public.interviews enable row level security;
alter table public.saved_jobs enable row level security;
alter table public.saved_searches enable row level security;
alter table public.orders enable row level security;
alter table public.entitlements enable row level security;
alter table public.stripe_events enable row level security;
alter table public.reports enable row level security;
alter table public.audit_events enable row level security;
alter table public.jobs_queue enable row level security;

-- Profiles: your own. Employers see what you sent them through applications.snapshot.
create policy profiles_own_select on public.profiles for select using (id = auth.uid());
create policy profiles_own_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Companies: public once they have a live job; members always.
create policy orgs_select on public.orgs for select using (
  public.is_org_member(id)
  or exists (select 1 from public.jobs j where j.org_id = orgs.id and j.status = 'published')
);
create policy orgs_update on public.orgs for update
  using (public.is_org_member(id, array['owner', 'admin']))
  with check (public.is_org_member(id, array['owner', 'admin']));
-- Verification and trust are set by Ocelot only.
revoke update on public.orgs from anon, authenticated;
grant update (name, slug, website, logo_url, about, locations) on public.orgs to authenticated;

create policy org_members_select on public.org_members for select using (public.is_org_member(org_id));
create policy org_members_insert on public.org_members for insert
  with check (public.is_org_member(org_id, array['owner', 'admin']) and role <> 'owner');
create policy org_members_update on public.org_members for update
  using (public.is_org_member(org_id, array['owner']))
  with check (public.is_org_member(org_id, array['owner']));
create policy org_members_delete on public.org_members for delete
  using (public.is_org_member(org_id, array['owner', 'admin']) or user_id = auth.uid());

-- Jobs: live jobs are public; members see and edit their own company's jobs.
create policy jobs_select on public.jobs for select using (status = 'published' or public.is_org_member(org_id));
create policy jobs_insert on public.jobs for insert with check (
  public.is_org_member(org_id) and status = 'draft' and source = 'employer'
  and published_at is null and expires_at is null and featured_until is null and created_by = auth.uid()
);
create policy jobs_update on public.jobs for update
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy jobs_delete on public.jobs for delete using (public.is_org_member(org_id) and status = 'draft');

create policy job_questions_select on public.job_questions for select using (
  exists (select 1 from public.jobs j where j.id = job_id and (j.status = 'published' or public.is_org_member(j.org_id)))
);
create policy job_questions_write on public.job_questions for all
  using (exists (select 1 from public.jobs j where j.id = job_id and public.is_org_member(j.org_id)))
  with check (exists (select 1 from public.jobs j where j.id = job_id and public.is_org_member(j.org_id)));

-- Documents: yours. A company sees the file details of a résumé sent to it; the file itself opens only
-- through a short signed link made by the server.
create policy documents_own on public.documents for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy documents_sent on public.documents for select using (
  exists (select 1 from public.applications a where a.resume_id = documents.id and public.is_org_member(a.org_id))
);

-- Applications: the candidate sends; the company moves the hiring stage.
create policy applications_select on public.applications for select
  using (candidate_id = auth.uid() or public.is_org_member(org_id));
create policy applications_insert on public.applications for insert with check (
  candidate_id = auth.uid() and hiring_stage = 'new'
  and exists (select 1 from public.jobs j where j.id = job_id and j.org_id = applications.org_id
              and j.status = 'published' and j.apply_method = 'ocelot')
  and (resume_id is null or exists (select 1 from public.documents d where d.id = resume_id and d.user_id = auth.uid()))
);
create policy applications_update on public.applications for update
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
revoke update on public.applications from anon, authenticated;
grant update (hiring_stage) on public.applications to authenticated;

create policy application_events_select on public.application_events for select using (
  exists (select 1 from public.applications a where a.id = application_id and (
    public.is_org_member(a.org_id) or (a.candidate_id = auth.uid() and visible_to_candidate)))
);

create policy application_notes_all on public.application_notes for all
  using (exists (select 1 from public.applications a where a.id = application_id and public.is_org_member(a.org_id)))
  with check (author_id = auth.uid()
    and exists (select 1 from public.applications a where a.id = application_id and public.is_org_member(a.org_id)));

-- The tracker and everything on it: the candidate only.
create policy tracker_items_own on public.tracker_items for all using (user_id = auth.uid()) with check (
  user_id = auth.uid()
  and (application_id is null or exists (select 1 from public.applications a where a.id = application_id and a.candidate_id = auth.uid()))
);
create policy tracker_events_own on public.tracker_events for all using (user_id = auth.uid()) with check (
  user_id = auth.uid() and exists (select 1 from public.tracker_items t where t.id = item_id and t.user_id = auth.uid())
);
create policy tasks_own on public.tasks for all using (user_id = auth.uid()) with check (
  user_id = auth.uid() and (item_id is null or exists (select 1 from public.tracker_items t where t.id = item_id and t.user_id = auth.uid()))
);
create policy interviews_own on public.interviews for all using (user_id = auth.uid()) with check (
  user_id = auth.uid() and exists (select 1 from public.tracker_items t where t.id = item_id and t.user_id = auth.uid())
);
create policy saved_jobs_own on public.saved_jobs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy saved_searches_own on public.saved_searches for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Billing: members can look; only the webhook writes.
create policy orders_select on public.orders for select using (public.is_org_member(org_id));
create policy entitlements_select on public.entitlements for select using (public.is_org_member(org_id));

-- Reports: anyone signed in can report; you see your own reports.
create policy reports_insert on public.reports for insert with check (reporter_id = auth.uid() and status = 'open');
create policy reports_select on public.reports for select using (reporter_id = auth.uid());

-- platform_admins, stripe_events, audit_events, jobs_queue: no policies, server only.
