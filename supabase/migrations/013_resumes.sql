-- Milestone 3 part 3: résumés.
-- A résumé row is made only by the server after it reads the file's first bytes, so people can rename
-- their own résumés and delete them, but can't add a row or point one at someone else's file.

alter table public.documents
  add constraint documents_name_length check (length(trim(name)) between 1 and 120),
  add constraint documents_own_folder check (storage_path like user_id::text || '/%');
create index documents_user on public.documents(user_id, created_at desc);

revoke insert, update on public.documents from anon, authenticated;
grant update (name) on public.documents to authenticated;

create trigger documents_limit before insert on public.documents for each row execute function public.limit_rows('20');

-- A tracker card can only point at your own résumé.
drop policy tracker_items_own on public.tracker_items;
create policy tracker_items_own on public.tracker_items for all using (user_id = auth.uid()) with check (
  user_id = auth.uid()
  and (application_id is null or exists (select 1 from public.applications a where a.id = application_id and a.candidate_id = auth.uid()))
  and (resume_id is null or exists (select 1 from public.documents d where d.id = resume_id and d.user_id = auth.uid()))
);
