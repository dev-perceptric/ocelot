-- Milestone 3, part 1: the tracker. Rows stay private to their owner (policies from 001).

-- One card per Ocelot job per person; saving twice finds the same card.
create unique index tracker_items_one_per_job on public.tracker_items(user_id, job_id) where job_id is not null;

alter table public.tracker_items
  add constraint tracker_items_title_length check (length(title) between 1 and 200),
  add constraint tracker_items_company_length check (length(company) <= 200),
  add constraint tracker_items_url check (url is null or (url ~* '^https?://' and length(url) <= 2000)),
  add constraint tracker_items_notes_length check (length(notes) <= 20000),
  add constraint tracker_items_contacts check (jsonb_typeof(contacts) = 'array' and jsonb_array_length(contacts) <= 20),
  add constraint tracker_items_location_length check (location is null or length(location) <= 200),
  add constraint tracker_items_salary_length check (salary is null or length(salary) <= 100);

-- Up to 1,000 cards per person; also logs when a card is made.
create or replace function public.tracker_item_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from tracker_items where user_id = new.user_id) > 1000 then
    raise exception 'You have 1,000 jobs in your tracker. Archive or delete some first.';
  end if;
  insert into tracker_events (item_id, user_id, kind, detail)
  values (new.id, new.user_id, 'created', jsonb_build_object('stage', new.stage, 'from_ocelot', new.job_id is not null));
  return null;
end $$;
create trigger tracker_items_created after insert on public.tracker_items
  for each row execute function public.tracker_item_created();

-- "Save job" on a job page: makes (or finds) the card, copying what the listing says.
create or replace function public.save_job(p_job uuid) returns uuid
language plpgsql set search_path = public as $$
declare v_id uuid; j jobs%rowtype; v_company text;
begin
  if auth.uid() is null then raise exception 'Log in to save jobs'; end if;
  select id into v_id from tracker_items where user_id = auth.uid() and job_id = p_job;
  if v_id is not null then return v_id; end if;
  select * into j from jobs where id = p_job;  -- row level security: only jobs this person can see
  if j.id is null then raise exception 'This job isn''t available'; end if;
  select name into v_company from orgs where id = j.org_id;
  insert into tracker_items (user_id, job_id, title, company, url, location, stage)
  values (auth.uid(), j.id, j.title, coalesce(v_company, ''), null,
    nullif(concat_ws(', ', case j.workplace when 'remote' then 'Remote' when 'hybrid' then 'Hybrid' when 'on_site' then 'On-site' end,
      (select string_agg(p.name, ' / ') from places p where p.slug = any(j.office_places))), ''),
    'saved')
  returning id into v_id;
  return v_id;
end $$;

-- After "Did you apply?" gets a Yes on an outside application: the card moves to Applied.
-- Only forward from Saved; a card already further along keeps its stage.
create or replace function public.mark_applied(p_job uuid) returns uuid
language plpgsql set search_path = public as $$
declare v_id uuid;
begin
  v_id := save_job(p_job);
  update tracker_items set stage = 'applied' where id = v_id and stage = 'saved';
  return v_id;
end $$;
