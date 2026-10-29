-- Job search, round two. Results take turns between companies (each company's best job, then each one's
-- second, and so on), in an order that changes each day but stays the same while paging. People can sort by
-- newest, keep to one company or to jobs posted in the last few days, set a lowest yearly pay, and find titles by
-- part of a word.

drop function if exists public.search_jobs(text, text[], text, text, text, text, text[], text[], boolean);

create function public.search_jobs(
  q text default null,
  workplaces text[] default null,
  country text default null,
  city text default null,
  category text default null,
  role text default null,
  seniorities text[] default null,
  types text[] default null,
  pay_only boolean default false,
  posted_days int default null,
  min_pay int default null,
  sort text default 'best',
  company text default null
) returns setof public.jobs
language sql stable set search_path = public as $$
  with t as (select nullif(trim(coalesce(q, '')), '') as q),
  m as (
    select j.id, j.org_id, j.published_at,
      (j.featured_until is not null and j.featured_until > now()) as featured,
      case when t.q is null then 0 else ts_rank(j.search, websearch_to_tsquery('simple', t.q)) + (j.title ilike '%' || like_escape(t.q) || '%')::int end as rank
    from jobs j
    join orgs o on o.id = j.org_id
    cross join t
    where j.status = 'published'
      and (t.q is null
           or j.search @@ websearch_to_tsquery('simple', t.q)
           or j.title ilike '%' || like_escape(t.q) || '%'
           or o.name ilike '%' || like_escape(t.q) || '%')
      and (workplaces is null or cardinality(workplaces) = 0 or j.workplace = any(workplaces))
      and (country is null or j.eligible_countries @> array[country])
      and (city is null or j.office_places @> array[city])
      and (search_jobs.category is null or j.category = search_jobs.category)
      and (search_jobs.role is null or j.role = search_jobs.role)
      and (seniorities is null or cardinality(seniorities) = 0 or j.seniority = any(seniorities))
      and (types is null or cardinality(types) = 0 or j.employment_type = any(types))
      and (not pay_only or j.salary_min is not null or j.salary_max is not null)
      and (search_jobs.company is null or o.slug = search_jobs.company)
      and (posted_days is null or j.published_at > now() - make_interval(days => posted_days))
      and (min_pay is null or (j.salary_period = 'year' and coalesce(j.salary_max, j.salary_min) >= min_pay))
  ),
  r as (
    select m.*, row_number() over (partition by m.org_id order by m.rank desc, m.published_at desc nulls last) as turn
    from m
  )
  select j.*
  from r join jobs j on j.id = r.id
  order by
    r.featured desc,
    case when search_jobs.sort = 'new' then extract(epoch from r.published_at) end desc nulls last,
    r.turn,
    r.rank desc,
    md5(r.org_id::text || current_date::text),
    r.published_at desc nulls last
$$;

-- Companies with live jobs, for the Company filter. Runs as the caller, so suspended companies stay hidden.
create or replace function public.live_companies() returns table (name text, slug text)
language sql stable set search_path = public as $$
  select o.name, o.slug from orgs o
  where exists (select 1 from jobs j where j.org_id = o.id and j.status = 'published')
  order by lower(o.name)
$$;

-- Saved searches keep the company and lowest pay too (posted and sort don't apply to alerts, which only send new jobs).
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
      min_pay => case when f->>'min_pay' ~ '^\d{1,7}$' then (f->>'min_pay')::int end
    ) j
    where j.published_at > s.checked_at and not org_suspended(j.org_id)
    limit 10;
end $$;
