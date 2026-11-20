-- More role and place pages (src/lib/seo.ts): each may add one extra filter, a level (/senior-sales-jobs), a job type
-- (/contract-marketing-jobs, /marketing-internships), hybrid or on-site (/hybrid-sales-jobs-in-chicago) or pay
-- (/sales-jobs-paying-100k). Plus each page's summary (top companies, pay range, remote share) and company pages by
-- area (/companies/stripe/sales-jobs).

-- Counts gain the extra: '' (none), 'level:senior', 'type:contract', 'wp:hybrid', 'pay:100000'.
alter table public.seo_page_counts add column extra text not null default '';
alter table public.seo_page_counts drop constraint seo_page_counts_pkey;
alter table public.seo_page_counts add primary key (area, place, extra);

-- Counted from the shown copy of each live job (036_search_speed.sql), from companies that aren't suspended, the
-- same jobs search shows. Pay counts yearly pay only, like the Pay filter.
create or replace function public.refresh_seo_counts() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from seo_page_counts;
  insert into seo_page_counts (area, place, extra, jobs)
  with live as (
    select j.id, j.category, j.role, j.workplace, j.eligible_countries, j.office_regions, j.office_places, j.seniority,
      j.employment_type, case when j.salary_period = 'year' then coalesce(j.salary_max, j.salary_min) end as yearly
    from jobs j join orgs o on o.id = j.org_id
    where j.status = 'published' and j.published_at is not null and j.shown and o.suspended_at is null
  ),
  areas as (
    select l.id, a from live l cross join lateral unnest(array['all', 'c:' || coalesce(l.category, 'other')]
      || case when l.role is not null then array['r:' || l.role] else '{}'::text[] end) a
  ),
  places as (
    select l.id, p from live l cross join lateral unnest(array['all']
      || array(select 'country:' || c from unnest(l.eligible_countries) c)
      || array(select 'region:' || r from unnest(l.office_regions) r)
      || array(select 'city:' || c from unnest(l.office_places) c)
      || case when l.workplace = 'remote' then array['remote'] else '{}'::text[] end
      || case when l.workplace = 'remote' and cardinality(l.office_regions) = 0 then array(select 'remote-in:' || c from unnest(l.eligible_countries) c) else '{}'::text[] end) p
  ),
  extras as (
    select l.id, e from live l cross join lateral unnest(array['']
      || case when l.seniority in ('entry', 'senior', 'lead', 'director') then array['level:' || l.seniority] else '{}'::text[] end
      || case when l.employment_type in ('part_time', 'contract', 'internship') then array['type:' || l.employment_type] else '{}'::text[] end
      || case when l.workplace in ('hybrid', 'on_site') then array['wp:' || l.workplace] else '{}'::text[] end
      || case when l.yearly >= 100000 then array['pay:100000'] else '{}'::text[] end
      || case when l.yearly >= 150000 then array['pay:150000'] else '{}'::text[] end) e
  )
  select a.a, p.p, e.e, count(*)::int
  from areas a join places p using (id) join extras e using (id)
  group by a.a, p.p, e.e;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.refresh_seo_counts() from public, anon, authenticated;

-- Unchanged for callers: the pages without an extra.
create or replace function public.seo_counts()
returns table (area text, place text, jobs int)
language sql stable set search_path = public as $$
  select area, place, jobs from seo_page_counts where extra = ''
$$;

-- What a role and place page says about its jobs, beyond the list: the companies with the most, the middle half of
-- yearly pay in the most common currency, and how many are remote. Same filters and visitor rule as search.
create or replace function public.search_summary(
  q text default null, workplaces text[] default null, country text default null, city text default null,
  category text default null, role text default null, seniorities text[] default null, types text[] default null,
  pay_only boolean default false, posted_days int default null, min_pay int default null,
  company text default null, region text default null
) returns jsonb
language sql stable security definer set search_path = public as $$
  with m as (
    select j.org_id, j.workplace, j.salary_currency,
      case when j.salary_period = 'year' then (coalesce(j.salary_min, j.salary_max) + coalesce(j.salary_max, j.salary_min)) / 2 end as mid
    from search_matches(q, workplaces, country, city, category, role, seniorities, types, pay_only, posted_days,
      min_pay, company, region) s
    join jobs j on j.id = s.id
  ),
  cur as (
    select salary_currency from m where mid is not null and salary_currency is not null
    group by salary_currency order by count(*) desc limit 1
  ),
  top as (
    select o.name, o.slug, count(*) as jobs from m join orgs o on o.id = m.org_id
    group by o.id order by count(*) desc, lower(o.name) limit 5
  )
  select jsonb_build_object(
    'jobs', (select count(*) from m),
    'remote', (select count(*) from m where workplace = 'remote'),
    'companies', (select count(distinct org_id) from m),
    'top', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'slug', slug, 'jobs', jobs)) from top), '[]'::jsonb),
    'pay_currency', (select salary_currency from cur),
    'pay_low', (select percentile_cont(0.25) within group (order by mid) from m where mid is not null and salary_currency = (select salary_currency from cur)),
    'pay_high', (select percentile_cont(0.75) within group (order by mid) from m where mid is not null and salary_currency = (select salary_currency from cur)),
    'pay_listed', (select count(*) from m where mid is not null and salary_currency = (select salary_currency from cur))
  )
$$;

-- Live jobs by company and area, for company pages by area (/companies/stripe/sales-jobs). Areas: 'c:sales',
-- 'r:account_executive'. Only areas with 3 or more jobs.
create or replace function public.company_area_counts()
returns table (slug text, name text, area text, jobs int)
language sql stable security definer set search_path = public as $$
  select o.slug, o.name, a, count(*)::int
  from jobs j
  join orgs o on o.id = j.org_id and o.suspended_at is null
  cross join lateral unnest(array['c:' || coalesce(j.category, 'other')]
    || case when j.role is not null then array['r:' || j.role] else '{}'::text[] end) a
  where j.status = 'published' and j.published_at is not null and j.shown
  group by o.slug, o.name, a
  having count(*) >= 3
$$;

select public.refresh_seo_counts();
notify pgrst, 'reload schema';
