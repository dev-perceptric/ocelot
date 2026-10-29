-- States and provinces. Jobs keep the US states and Canadian provinces they're in ("US-TX", "CA-ON"): imported
-- jobs from their location text, and every job from its office cities. Search can keep to one state or province.

alter table public.places add column region text check (region ~ '^(US|CA)-[A-Z]{2}$');
update public.places p set region = v.region from (values
  ('new-york', 'US-NY'), ('san-francisco', 'US-CA'), ('los-angeles', 'US-CA'), ('seattle', 'US-WA'), ('austin', 'US-TX'), ('boston', 'US-MA'),
  ('chicago', 'US-IL'), ('denver', 'US-CO'), ('atlanta', 'US-GA'), ('miami', 'US-FL'), ('washington-dc', 'US-DC'), ('dallas', 'US-TX'),
  ('houston', 'US-TX'), ('san-diego', 'US-CA'), ('san-jose', 'US-CA'), ('phoenix', 'US-AZ'), ('philadelphia', 'US-PA'), ('portland', 'US-OR'),
  ('salt-lake-city', 'US-UT'), ('minneapolis', 'US-MN'), ('nashville', 'US-TN'), ('raleigh', 'US-NC'), ('pittsburgh', 'US-PA'),
  ('detroit', 'US-MI'), ('toronto', 'CA-ON'), ('vancouver', 'CA-BC'), ('montreal', 'CA-QC'), ('calgary', 'CA-AB'), ('ottawa', 'CA-ON'),
  ('waterloo', 'CA-ON'), ('edmonton', 'CA-AB')) v(slug, region)
where p.slug = v.slug;

alter table public.jobs add column office_regions text[] not null default '{}'
  check (array_to_string(office_regions, ',') ~ '^((US|CA)-[A-Z]{2}(,|$))*$' and cardinality(office_regions) <= 60);
create index jobs_office_regions on public.jobs using gin (office_regions);

-- Every job gets the states of its office cities. A company's own jobs get only those; an imported job also keeps
-- the ones its board's location text names.
create or replace function public.job_regions() returns trigger
language plpgsql set search_path = public as $$
begin
  new.office_regions := array(
    select distinct r from unnest(
      (case when new.source = 'ats' then new.office_regions else '{}'::text[] end)
      || array(select region from places where slug = any(new.office_places) and region is not null)) r
    order by r);
  return new;
end $$;
create trigger jobs_regions before insert or update of office_places, office_regions, source on public.jobs
  for each row execute function public.job_regions();
update public.jobs set office_places = office_places;

drop function if exists public.search_jobs(text, text[], text, text, text, text, text[], text[], boolean, int, int, text, text);

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
  company text default null,
  region text default null
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
      -- A state or province: offices there, plus remote jobs open to the whole country.
      and (search_jobs.region is null or j.office_regions @> array[search_jobs.region]
           or (j.workplace = 'remote' and cardinality(j.office_regions) = 0 and j.eligible_countries @> array[left(search_jobs.region, 2)]))
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
      min_pay => case when f->>'min_pay' ~ '^\d{1,7}$' then (f->>'min_pay')::int end
    ) j
    where j.published_at > s.checked_at and not org_suspended(j.org_id)
    limit 10;
end $$;
