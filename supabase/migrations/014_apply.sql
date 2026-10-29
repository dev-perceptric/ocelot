-- Milestone 4 part 1: applying on Ocelot.
-- An application is made only by apply_to_job(), which checks the job, the résumé and the answers, and copies
-- what was sent into the snapshot. The company moves the hiring stage; only the candidate can withdraw.

revoke insert on public.applications from anon, authenticated;

create or replace function public.apply_to_job(p_job uuid, p_resume uuid, p_answers jsonb default '{}', p_note text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_job jobs%rowtype;
  v_p profiles%rowtype;
  v_note text := trim(coalesce(p_note, ''));
  v_answers jsonb := coalesce(p_answers, '{}');
  v_qs jsonb;
  v_city text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Log in to apply.'; end if;
  select * into v_job from jobs where id = p_job;
  if not found or v_job.status <> 'published' or v_job.apply_method <> 'ocelot'
     or (v_job.expires_at is not null and v_job.expires_at <= now()) or org_suspended(v_job.org_id) then
    raise exception 'This job isn''t taking applications.';
  end if;
  if is_org_member(v_job.org_id) then raise exception 'You can''t apply to your own company''s job.'; end if;
  if exists (select 1 from applications where job_id = p_job and candidate_id = v_uid) then
    raise exception 'You already applied to this job.';
  end if;
  if (select count(*) from applications where candidate_id = v_uid and submitted_at > now() - interval '1 day') >= 50 then
    raise exception 'You''ve sent 50 applications today. Try again tomorrow.';
  end if;
  if not exists (select 1 from documents where id = p_resume and user_id = v_uid and deleted_at is null) then
    raise exception 'Choose your résumé.';
  end if;
  select * into v_p from profiles where id = v_uid;
  if coalesce(trim(v_p.full_name), '') = '' then raise exception 'Add your name.'; end if;
  if length(v_note) > 3000 then raise exception 'Keep the note under 3,000 characters.'; end if;
  if jsonb_typeof(v_answers) <> 'object' then raise exception 'Answer the questions.'; end if;
  if exists (select 1 from job_questions q where q.job_id = p_job and q.required and trim(coalesce(v_answers ->> q.id::text, '')) = '') then
    raise exception 'Answer the required questions.';
  end if;
  if exists (select 1 from job_questions q where q.job_id = p_job and length(trim(coalesce(v_answers ->> q.id::text, ''))) > 2000) then
    raise exception 'Keep each answer under 2,000 characters.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('prompt', q.prompt, 'answer', trim(coalesce(v_answers ->> q.id::text, ''))) order by q.position), '[]')
    into v_qs from job_questions q where q.job_id = p_job;
  select name into v_city from places where slug = v_p.city;

  insert into applications (job_id, org_id, candidate_id, resume_id, snapshot, snapshot_version)
  values (p_job, v_job.org_id, v_uid, p_resume, jsonb_build_object(
    'name', trim(v_p.full_name), 'email', v_p.email, 'phone', v_p.phone, 'headline', v_p.headline,
    'city', v_city, 'country_code', v_p.country_code, 'years_experience', v_p.years_experience,
    'languages', to_jsonb(v_p.languages), 'links', v_p.links,
    'salary_hope', case when v_p.salary_hope_min is null then null else jsonb_build_object(
      'min', v_p.salary_hope_min, 'currency', v_p.salary_hope_currency, 'period', v_p.salary_hope_period) end,
    'answers', v_qs, 'note', nullif(v_note, ''), 'job_title', v_job.title), 2)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.apply_to_job(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.apply_to_job(uuid, uuid, jsonb, text) to authenticated;

-- Withdrawn is the candidate's call, and final. Withdrawing also moves their own card to Withdrawn.
create or replace function public.guard_hiring_stage() returns trigger
language plpgsql as $$
begin
  if new.hiring_stage is distinct from old.hiring_stage then
    if old.hiring_stage = 'withdrawn' then raise exception 'The candidate withdrew this application.'; end if;
    if new.hiring_stage = 'withdrawn' and auth.uid() is distinct from old.candidate_id then
      raise exception 'Only the candidate can withdraw an application.';
    end if;
  end if;
  return new;
end $$;
create trigger applications_guard_stage before update on public.applications
  for each row execute function public.guard_hiring_stage();

create or replace function public.withdraw_application(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update applications set hiring_stage = 'withdrawn'
  where id = p_id and candidate_id = auth.uid() and hiring_stage not in ('withdrawn', 'hired');
  if not found then raise exception 'This application can''t be withdrawn.'; end if;
  update tracker_items set stage = 'withdrawn' where application_id = p_id and user_id = auth.uid();
end $$;
revoke execute on function public.withdraw_application(uuid) from public, anon;
grant execute on function public.withdraw_application(uuid) to authenticated;

-- A résumé that was sent stays with the companies that got it: deleting it only hides it from your list.
-- Deleting the account removes it for real (the account is already gone when this runs).
alter table public.documents add column deleted_at timestamptz;

create or replace function public.keep_sent_resume() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from applications a where a.resume_id = old.id and a.candidate_id is not null)
     and exists (select 1 from auth.users u where u.id = old.user_id) then
    update documents set deleted_at = coalesce(deleted_at, now()) where id = old.id;
    return null;
  end if;
  return old;
end $$;
create trigger documents_keep_sent before delete on public.documents
  for each row execute function public.keep_sent_resume();

-- The limit of 20 counts the résumés people can see.
drop trigger documents_limit on public.documents;
create or replace function public.documents_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from documents where user_id = new.user_id and deleted_at is null) >= 20 then
    raise exception 'You have reached the limit of 20 here. Delete some old ones first.';
  end if;
  return new;
end $$;
create trigger documents_limit before insert on public.documents for each row execute function public.documents_limit();
