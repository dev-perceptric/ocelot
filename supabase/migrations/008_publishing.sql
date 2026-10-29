-- Milestone 2, part 1: sending jobs for review, publishing, and the rules around editing live jobs.

-- What a job needs before anyone reviews it. Returns the first thing missing, or null when it's ready.
create or replace function public.job_missing(j public.jobs) returns text
language sql stable as $$
  select case
    when length(trim(coalesce(j.title, ''))) < 3 then 'Add a job title.'
    when j.role is null then 'Choose a role.'
    when j.seniority is null then 'Choose a seniority.'
    when j.employment_type is null then 'Choose an employment type.'
    when j.workplace is null then 'Choose on-site, hybrid or remote.'
    when coalesce(array_length(j.eligible_countries, 1), 0) = 0 then 'Add an eligible hiring location so candidates know whether they can apply.'
    when j.workplace in ('on_site', 'hybrid') and coalesce(array_length(j.office_places, 1), 0) = 0 then 'Add the office city.'
    when length(trim(coalesce(j.description, ''))) < 200 then 'Write a description of at least 200 characters.'
    when (j.salary_min is not null or j.salary_max is not null) and (j.salary_currency is null or j.salary_period is null) then 'Add the currency and period for the pay.'
    when j.apply_method = 'external' and coalesce(j.apply_url, '') !~ '^https?://' then 'Add the web address where people apply.'
    else null
  end
$$;

create or replace function public.org_trusted(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select trusted from orgs where id = p_org), false)
$$;

-- Runs as the caller (not security definer), so current_user tells people apart from the server.
create or replace function public.guard_job_update() returns trigger
language plpgsql set search_path = public as $$
declare v_trusted boolean; v_missing text; v_content_changed boolean;
begin
  new.updated_at := now();
  if current_user not in ('authenticated', 'anon') then return new; end if;

  if new.org_id <> old.org_id or new.published_at is distinct from old.published_at
     or new.expires_at is distinct from old.expires_at or new.featured_until is distinct from old.featured_until
     or new.review_note is distinct from old.review_note or new.source <> old.source
     or new.created_by is distinct from old.created_by or new.slug <> old.slug then
    raise exception 'Only Ocelot can change this field';
  end if;

  v_trusted := org_trusted(new.org_id);

  -- Changing what candidates see on a live job sends it back to review, unless the company is trusted.
  v_content_changed := (new.title, new.description, new.role, new.seniority, new.employment_type, new.workplace,
      new.office_places, new.eligible_countries, new.time_zones, new.salary_min, new.salary_max, new.salary_currency,
      new.salary_period, new.apply_method, new.apply_url)
    is distinct from (old.title, old.description, old.role, old.seniority, old.employment_type, old.workplace,
      old.office_places, old.eligible_countries, old.time_zones, old.salary_min, old.salary_max, old.salary_currency,
      old.salary_period, old.apply_method, old.apply_url);
  if old.status = 'published' and new.status = 'published' and v_content_changed and not v_trusted then
    new.status := 'pending_review';
  end if;

  if new.status <> old.status and not (
       (old.status in ('draft', 'rejected', 'published') and new.status = 'pending_review')
    or (old.status in ('pending_review', 'rejected') and new.status = 'draft')
    or (old.status = 'published' and new.status = 'closed')
  ) then
    raise exception 'A job can''t move from % to %', old.status, new.status;
  end if;

  if new.status = 'pending_review' and old.status <> 'pending_review' then
    if org_suspended(new.org_id) then raise exception 'This company is suspended. Contact Ocelot.'; end if;
    v_missing := job_missing(new);
    if v_missing is not null then raise exception '%', v_missing; end if;
    new.review_note := null;
    -- Trusted companies publish without waiting.
    if v_trusted then
      new.status := 'published';
      new.published_at := coalesce(case when old.status = 'published' then old.published_at end, now());
      new.expires_at := coalesce(case when old.status = 'published' then old.expires_at end, now() + interval '30 days');
    end if;
  end if;
  return new;
end $$;

-- Review decisions. Called by the server (service role) after it checks the admin.
create or replace function public.publish_job(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update jobs set status = 'published', review_note = null,
    published_at = coalesce(published_at, now()),
    expires_at = case when expires_at is null or expires_at < now() then now() + interval '30 days' else expires_at end
  where id = p_job and status = 'pending_review';
  if not found then raise exception 'This job is no longer waiting for review'; end if;
end $$;

create or replace function public.send_back_job(p_job uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if length(trim(coalesce(p_note, ''))) < 5 then raise exception 'Say what needs to change'; end if;
  update jobs set status = 'rejected', review_note = trim(p_note) where id = p_job and status = 'pending_review';
  if not found then raise exception 'This job is no longer waiting for review'; end if;
end $$;
revoke execute on function public.publish_job(uuid), public.send_back_job(uuid, text) from public, anon, authenticated;

-- Closed and expired jobs keep their page ("This role has closed"); drafts and reviews stay private.
drop policy jobs_select on public.jobs;
create policy jobs_select on public.jobs for select using (
  public.is_org_member(org_id)
  or (status in ('published', 'closed', 'expired') and published_at is not null and not public.org_suspended(org_id))
);

-- Members may delete drafts and jobs that were sent back and never published.
drop policy jobs_delete on public.jobs;
create policy jobs_delete on public.jobs for delete
  using (public.is_org_member(org_id) and status in ('draft', 'rejected') and published_at is null);

-- Up to 5 screening questions per job, each up to 300 characters.
alter table public.job_questions add constraint job_questions_prompt check (length(trim(prompt)) between 3 and 300);
create or replace function public.limit_job_questions() returns trigger
language plpgsql as $$
begin
  if (select count(*) from job_questions where job_id = new.job_id) >= 5 then
    raise exception 'A job can have up to 5 questions';
  end if;
  return new;
end $$;
create trigger job_questions_limit before insert on public.job_questions
  for each row execute function public.limit_job_questions();

-- A draft can say "apply on our site" before the link is filled in; job_missing requires it before review.
alter table public.jobs drop constraint jobs_check1;

-- A company stays public while any of its jobs has a public page, including closed ones ("This role has closed").
drop policy orgs_select on public.orgs;
create policy orgs_select on public.orgs for select using (
  public.is_org_member(id)
  or (suspended_at is null and exists (select 1 from public.jobs j where j.org_id = orgs.id
        and j.status in ('published', 'closed', 'expired') and j.published_at is not null))
);

-- Lets the server read members with their profile in one query (every account has a profile).
alter table public.org_members add constraint org_members_profile_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;
