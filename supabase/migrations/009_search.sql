-- Milestone 2, part 2: job search. Runs as the caller, so the usual rules apply (only published jobs from
-- companies that aren't suspended). Called through PostgREST with count=exact and a range for paging.

create or replace function public.like_escape(p text) returns text
language sql immutable as $$ select replace(replace(replace(p, '\', '\\'), '%', '\%'), '_', '\_') $$;

create or replace function public.search_jobs(
  q text default null,
  workplaces text[] default null,
  country text default null,
  city text default null,
  category text default null,
  role text default null,
  seniorities text[] default null,
  types text[] default null,
  pay_only boolean default false
) returns setof public.jobs
language sql stable set search_path = public as $$
  with t as (select nullif(trim(coalesce(q, '')), '') as q)
  select j.*
  from jobs j
  join orgs o on o.id = j.org_id
  cross join t
  where j.status = 'published'
    and (t.q is null
         or j.search @@ websearch_to_tsquery('simple', t.q)
         or o.name ilike '%' || like_escape(t.q) || '%')
    and (workplaces is null or cardinality(workplaces) = 0 or j.workplace = any(workplaces))
    and (country is null or j.eligible_countries @> array[country])
    and (city is null or j.office_places @> array[city])
    and (search_jobs.category is null or j.category = search_jobs.category)
    and (search_jobs.role is null or j.role = search_jobs.role)
    and (seniorities is null or cardinality(seniorities) = 0 or j.seniority = any(seniorities))
    and (types is null or cardinality(types) = 0 or j.employment_type = any(types))
    and (not pay_only or j.salary_min is not null or j.salary_max is not null)
  order by
    (j.featured_until is not null and j.featured_until > now()) desc,
    case when t.q is null then 0 else ts_rank(j.search, websearch_to_tsquery('simple', t.q)) end desc,
    j.published_at desc
$$;

-- Matches for "company name" searches use this index.
create extension if not exists pg_trgm;
create index if not exists orgs_name_trgm on public.orgs using gin (name gin_trgm_ops);
