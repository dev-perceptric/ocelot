-- Common words ("engineer" matches tens of thousands of jobs) still ran past the 3-second limit on visitors' queries
-- after 046_fast_keyword_search.sql: each match was scored against its whole description, even just to count them.
-- Now a match scores 1 when its title has the words and 0 otherwise, and matches are found through the whole text as
-- before.

create or replace function public.search_matches(
  q text default null, workplaces text[] default null, country text default null, city text default null,
  category text default null, role text default null, seniorities text[] default null, types text[] default null,
  pay_only boolean default false, posted_days int default null, min_pay int default null,
  company text default null, region text default null, no_agency boolean default false, agency text default null,
  industry text default null
) returns table (id uuid, org_id uuid, published_at timestamptz, featured boolean, rank real)
language sql stable security definer set search_path = public as $$
  with t as (select nullif(trim(coalesce(q, '')), '') as q),
  -- Jobs matching the words, found three ways, each through its own index: the job's text (jobs_search), its title
  -- (jobs_title_trgm) and its company's name (orgs_name_trgm). One "or" across all three made Postgres read every job.
  hits as (
    select j.id from jobs j, t where t.q is not null and j.status = 'published' and j.search @@ websearch_to_tsquery('simple', t.q)
    union
    select j.id from jobs j, t where t.q is not null and j.status = 'published' and j.title ilike '%' || like_escape(t.q) || '%'
    union
    select j.id from orgs o join jobs j on j.org_id = o.id and j.status = 'published', t
      where t.q is not null and o.name ilike '%' || like_escape(t.q) || '%'
  )
  select j.id, j.org_id, j.published_at, (j.featured_until is not null and j.featured_until > now()),
    -- A job whose title has the words comes first; the rest follow in the usual order (newest first, companies taking
    -- turns). Scoring every match against its whole description (ts_rank on j.search) made common words like
    -- "engineer" run past the 3-second limit. Matching still uses the whole text.
    (case when t.q is null then 0 else (j.title ilike '%' || like_escape(t.q) || '%')::int end)::real
  from jobs j
  join orgs o on o.id = j.org_id and o.suspended_at is null
  cross join t
  where j.status = 'published' and j.published_at is not null and j.shown
    and (t.q is null or j.id in (select id from hits))
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
      and (search_matches.industry is null or o.industry = search_matches.industry)
$$;

notify pgrst, 'reload schema';
