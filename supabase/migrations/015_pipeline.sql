-- Milestone 4 part 2: the applicant pipeline.
-- Hiring notes: the whole team reads them, each person adds and deletes their own, nobody edits them.

drop policy application_notes_all on public.application_notes;
create policy application_notes_select on public.application_notes for select
  using (exists (select 1 from public.applications a where a.id = application_id and public.is_org_member(a.org_id)));
create policy application_notes_insert on public.application_notes for insert with check (author_id = auth.uid()
  and exists (select 1 from public.applications a where a.id = application_id and public.is_org_member(a.org_id)));
create policy application_notes_delete on public.application_notes for delete using (author_id = auth.uid()
  and exists (select 1 from public.applications a where a.id = application_id and public.is_org_member(a.org_id)));
revoke update on public.application_notes from anon, authenticated;
alter table public.application_notes add constraint application_notes_body check (length(trim(body)) between 1 and 5000);
create index application_notes_app on public.application_notes(application_id, created_at);

create index applications_job on public.applications(job_id, submitted_at desc);
create index applications_org_recent on public.applications(org_id, submitted_at desc);
create index application_events_app on public.application_events(application_id, created_at);
