-- The private résumé bucket. Files live at resumes/<user id>/<file>; only the owner can read or write them.
-- Companies get a short signed link from the server after it checks the application.
-- Skipped on plain Postgres (tests), where the storage schema doesn't exist.
do $$
begin
  if to_regclass('storage.buckets') is null then return; end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('resumes', 'resumes', false, 5242880,
    array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
  on conflict (id) do nothing;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('logos', 'logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
  on conflict (id) do nothing;

  execute $p$create policy resumes_own_read on storage.objects for select to authenticated
    using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy resumes_own_write on storage.objects for insert to authenticated
    with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy resumes_own_delete on storage.objects for delete to authenticated
    using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text)$p$;

  -- Logos: <org id>/<file>, written by that company's owners and admins.
  execute $p$create policy logos_write on storage.objects for insert to authenticated
    with check (bucket_id = 'logos' and public.is_org_member(((storage.foldername(name))[1])::uuid, array['owner','admin']))$p$;
  execute $p$create policy logos_delete on storage.objects for delete to authenticated
    using (bucket_id = 'logos' and public.is_org_member(((storage.foldername(name))[1])::uuid, array['owner','admin']))$p$;
end $$;
