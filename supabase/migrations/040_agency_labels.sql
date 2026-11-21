-- Milestone 7, step 3: agency jobs say who posted them, candidates can hide them, and an application records the
-- agency that received it (docs/m7-agencies.md).

-- ---------- Search: "Hide agency jobs" and one agency's jobs ----------
-- Same as 036_search_speed.sql, with two more filters at the end: no_agency leaves out jobs from companies an
-- agency manages, and agency keeps to the clients of one agency (its slug; a suspended agency has none).

drop function if exists public.search_jobs(text, text[], text, text, text, text, text[], text[], boolean, int, int, text, text, text, int, int);
drop function if exists public.search_jobs_count(text, text[], text, text, text, text, text[], text[], boolean, int, int, text, text);
drop function if exists public.search_matches(text, text[], text, text, text, text, text[], text[], boolean, int, int, text, text);

create or replace function public.search_matches(
  q text default null, workplaces text[] default null, country text default null, city text default null,
  category text default null, role text default null, seniorities text[] default null, types text[] default null,
  pay_only boolean default false, posted_days int default null, min_pay int default null,
  company text default null, region text default null, no_agency boolean default false, agency text default null
) returns table (id uuid, org_id uuid, published_at timestamptz, featured boolean, rank real)
language sql stable security definer set search_path = public as $$
  with t as (select nullif(trim(coalesce(q, '')), '') as q)
  select j.id, j.org_id, j.published_at, (j.featured_until is not null and j.featured_until > now()),
    (case when t.q is null then 0 else ts_rank(j.search, websearch_to_tsquery('simple', t.q)) + (j.title ilike '%' || like_escape(t.q) || '%')::int end)::real
  from jobs j
  join orgs o on o.id = j.org_id and o.suspended_at is null
  cross join t
  where j.status = 'published' and j.published_at is not null and j.shown
    and (t.q is null
         or j.search @@ websearch_to_tsquery('simple', t.q)
         or j.title ilike '%' || like_escape(t.q) || '%'
         or o.name ilike '%' || like_escape(t.q) || '%')
      and (workplaces is null or cardinality(workplaces) = 0 or j.workplace = any(workplaces))
      and (country is null or j.eligible_countries @> array[country])
      and (city is null or j.office_places @> array[city])
      and (search_matches.category is null or j.category = search_matches.category)
      and (search_matches.role is null or j.role = search_matches.role)
      and (seniorities is null or cardinality(seniorities) = 0 or j.seniority = any(seniorities))
      and (types is null or cardinality(types) = 0 or j.employment_type = any(types))
      and (not pay_only or j.salary_min is not null or j.salary_max is not null)
      and (search_matches.company is null or o.slug = search_matches.company)
      and (search_matches.region is null or j.office_regions @> array[search_matches.region]
           or (j.workplace = 'remote' and cardinality(j.office_regions) = 0 and j.eligible_countries @> array[left(search_matches.region, 2)]))
      and (posted_days is null or j.published_at > now() - make_interval(days => posted_days))
      and (min_pay is null or (j.salary_period = 'year' and coalesce(j.salary_max, j.salary_min) >= min_pay))
      and (not coalesce(no_agency, false) or o.agency_id is null)
      and (search_matches.agency is null or exists (
        select 1 from agencies a where a.id = o.agency_id and a.slug = search_matches.agency and a.suspended_at is null))
$$;

create or replace function public.search_jobs(
  q text default null, workplaces text[] default null, country text default null, city text default null,
  category text default null, role text default null, seniorities text[] default null, types text[] default null,
  pay_only boolean default false, posted_days int default null, min_pay int default null,
  sort text default 'best', company text default null, region text default null,
  p_limit int default null, p_offset int default 0, no_agency boolean default false, agency text default null
) returns setof public.jobs
language sql stable security definer set search_path = public as $$
  with r as (
    select m.*, row_number() over (partition by m.org_id order by m.rank desc, m.published_at desc nulls last) as turn
    from search_matches(q, workplaces, country, city, category, role, seniorities, types, pay_only, posted_days,
      min_pay, company, region, no_agency, agency) m
  ),
  page as (
    select r.id, row_number() over (order by r.featured desc,
        case when search_jobs.sort = 'new' then extract(epoch from r.published_at) end desc nulls last,
        r.turn, r.rank desc, md5(r.org_id::text || current_date::text), r.published_at desc nulls last, r.id) as n
    from r
    order by n
    limit p_limit offset greatest(coalesce(p_offset, 0), 0)
  )
  select j.* from page join jobs j on j.id = page.id order by page.n
$$;

create or replace function public.search_jobs_count(
  q text default null, workplaces text[] default null, country text default null, city text default null,
  category text default null, role text default null, seniorities text[] default null, types text[] default null,
  pay_only boolean default false, posted_days int default null, min_pay int default null,
  company text default null, region text default null, no_agency boolean default false, agency text default null
) returns bigint
language sql stable security definer set search_path = public as $$
  select count(*) from search_matches(q, workplaces, country, city, category, role, seniorities, types, pay_only,
    posted_days, min_pay, company, region, no_agency, agency)
$$;

-- Saved search alerts honor "Hide agency jobs" too.
create or replace function public.alert_jobs(p_search uuid) returns setof public.jobs
language plpgsql stable security definer set search_path = public as $$
declare s saved_searches%rowtype; f jsonb;
begin
  select * into s from saved_searches where id = p_search;
  if not found then return; end if;
  f := s.filters;
  return query
    select j.* from search_jobs(
      q => nullif(s.query, ''),
      workplaces => array(select jsonb_array_elements_text(coalesce(f->'where', '[]'))),
      country => f->>'country', city => f->>'city', category => f->>'category', role => f->>'role',
      seniorities => array(select jsonb_array_elements_text(coalesce(f->'level', '[]'))),
      types => array(select jsonb_array_elements_text(coalesce(f->'type', '[]'))),
      pay_only => coalesce((f->>'pay')::boolean, false),
      company => f->>'company',
      region => f->>'region',
      min_pay => case when f->>'min_pay' ~ '^\d{1,7}$' then (f->>'min_pay')::int end,
      no_agency => coalesce((f->>'no_agency')::boolean, false)
    ) j
    where j.published_at > s.checked_at and not org_suspended(j.org_id)
    limit 10;
end $$;

-- Agencies with live jobs, for the sitemap: the same visitor rule as hiring_companies.
create or replace function public.hiring_agencies()
returns table (name text, slug text, jobs bigint)
language sql stable security definer set search_path = public as $$
  select a.name, a.slug, count(*) as jobs
  from agencies a
  join orgs o on o.agency_id = a.id and o.suspended_at is null
  join jobs j on j.org_id = o.id and j.status = 'published' and j.published_at is not null and j.shown
  where a.suspended_at is null
  group by a.id
  order by jobs desc, lower(a.name)
$$;

-- ---------- Applications remember the agency that received them ----------
-- Set when the application is sent and never changed after, so the candidate always sees who got it, even if the
-- company later leaves the agency or the agency is renamed or deleted.

alter table public.applications
  add column agency_id uuid references public.agencies(id) on delete set null,
  add column agency_name text;

create or replace function public.application_agency() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select a.id, a.name into new.agency_id, new.agency_name
  from orgs o join agencies a on a.id = o.agency_id where o.id = new.org_id;
  return new;
end $$;
create trigger applications_agency before insert on public.applications
  for each row execute function public.application_agency();

-- Nobody edits it afterwards: people can only change the hiring stage (001_foundation.sql), and this guards the
-- server too.
create or replace function public.keep_application_agency() returns trigger
language plpgsql set search_path = public as $$
begin
  new.agency_name := old.agency_name;
  if new.agency_id is not null then new.agency_id := old.agency_id; end if; -- a deleted agency still clears it
  return new;
end $$;
create trigger applications_keep_agency before update on public.applications
  for each row execute function public.keep_application_agency();

notify pgrst, 'reload schema';
