-- Milestone 1, part E: what admins can do to a company. Admin pages use the service role after checking
-- platform_admins, and every action writes an audit_events row.

alter table public.orgs add column suspended_at timestamptz;
alter table public.orgs add column suspended_reason text;
alter table public.orgs add column business_verified_note text; -- what the admin checked

-- A suspended company and all its jobs disappear from public pages. Members still see their own data.
-- Security definer so the jobs and orgs rules can ask about each other without looping.
create or replace function public.org_suspended(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select suspended_at is not null from orgs where id = p_org), false)
$$;

drop policy jobs_select on public.jobs;
create policy jobs_select on public.jobs for select using (
  public.is_org_member(org_id)
  or (status = 'published' and not public.org_suspended(org_id))
);

drop policy orgs_select on public.orgs;
create policy orgs_select on public.orgs for select using (
  public.is_org_member(id)
  or (suspended_at is null and exists (select 1 from public.jobs j where j.org_id = orgs.id and j.status = 'published'))
);

-- Applications can't be sent to a suspended company.
drop policy applications_insert on public.applications;
create policy applications_insert on public.applications for insert with check (
  candidate_id = auth.uid() and hiring_stage = 'new'
  and not public.org_suspended(org_id)
  and exists (select 1 from public.jobs j where j.id = job_id and j.org_id = applications.org_id
              and j.status = 'published' and j.apply_method = 'ocelot')
  and (resume_id is null or exists (select 1 from public.documents d where d.id = resume_id and d.user_id = auth.uid()))
);

-- Overview numbers in one call for /admin.
create or replace function public.admin_counts() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'people', (select count(*) from profiles),
    'candidates', (select count(*) from profiles where intent = 'candidate' and full_name is not null),
    'companies', (select count(*) from orgs),
    'members', (select count(*) from org_members),
    'jobs_live', (select count(*) from jobs where status = 'published'),
    'jobs_review', (select count(*) from jobs where status = 'pending_review'),
    'applications', (select count(*) from applications),
    'emails_today', (select count(*) from email_log where status = 'sent' and created_at > now() - interval '1 day'),
    'emails_failed', (select count(*) from email_log where status = 'failed' and created_at > now() - interval '7 days'),
    'tasks_failed', (select count(*) from jobs_queue where error is not null and (done_at is not null or attempts >= 5)),
    'reports_open', (select count(*) from reports where status = 'open')
  )
$$;
revoke execute on function public.admin_counts() from public, anon, authenticated;
