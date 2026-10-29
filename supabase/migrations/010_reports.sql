-- Milestone 2, part 3: reports from job pages. Signed-in people report as themselves; visitors' reports are
-- saved by the server with a limit per job. Admins handle them in /admin/reports.

alter table public.reports add column contact_email text check (contact_email is null or contact_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$');
alter table public.reports add column handled_by uuid references auth.users(id) on delete set null;
alter table public.reports add column handled_at timestamptz;
alter table public.reports add column admin_note text;
alter table public.reports add constraint reports_details_length check (length(details) <= 2000);
create index reports_open on public.reports(created_at) where status = 'open';

-- One open report per person per job; repeat clicks don't pile up.
create unique index reports_one_open_per_person on public.reports(reporter_id, job_id)
  where status = 'open' and reporter_id is not null;

-- Reports are for live or recently closed jobs: the job must be public.
drop policy reports_insert on public.reports;
create policy reports_insert on public.reports for insert with check (
  reporter_id = auth.uid() and status = 'open' and handled_by is null and handled_at is null and admin_note is null
  and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.status in ('published', 'closed', 'expired')))
);
