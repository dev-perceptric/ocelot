-- Company industries: a fixed list, each company's industry picked from it, and an Industries filter on Find jobs
-- (next to the job areas). The app's copy of the list is INDUSTRIES in src/lib/taxonomy.ts (tests/lists.test.ts).

create table public.industries (
  slug text primary key,
  name text not null unique,
  position int not null
);
alter table public.industries enable row level security;
create policy industries_read on public.industries for select using (true);
grant select on public.industries to anon, authenticated;

insert into public.industries (slug, name, position) values
  ('software', 'Software and SaaS', 1),
  ('ai_data', 'AI and data', 2),
  ('security', 'Cybersecurity', 3),
  ('fintech', 'Finance and fintech', 4),
  ('insurance', 'Insurance', 5),
  ('crypto', 'Crypto and web3', 6),
  ('healthcare', 'Healthcare', 7),
  ('biotech', 'Biotech and pharma', 8),
  ('ecommerce', 'E-commerce and retail', 9),
  ('consumer', 'Consumer products', 10),
  ('food', 'Food and restaurants', 11),
  ('marketing', 'Marketing and advertising', 12),
  ('media', 'Media and entertainment', 13),
  ('gaming', 'Gaming', 14),
  ('education', 'Education', 15),
  ('hr', 'HR and recruiting', 16),
  ('travel', 'Travel and hospitality', 17),
  ('real_estate', 'Real estate and construction', 18),
  ('logistics', 'Logistics and transportation', 19),
  ('manufacturing', 'Manufacturing and hardware', 20),
  ('energy', 'Energy and climate', 21),
  ('telecom', 'Telecom', 22),
  ('automotive', 'Automotive and mobility', 23),
  ('services', 'Consulting and professional services', 24),
  ('nonprofit', 'Nonprofit and government', 25),
  ('other', 'Other', 26);

-- orgs.industry was free text (003_lists_and_profiles.sql). Text that names an industry on the list becomes it; other
-- text is cleared, and the company picks from the list the next time it edits its page.
update public.orgs o set industry = i.slug
  from public.industries i
  where o.industry is not null and lower(trim(o.industry)) in (lower(i.name), i.slug);
update public.orgs set industry = null where industry is not null and industry not in (select slug from public.industries);
alter table public.orgs add constraint orgs_industry_fkey foreign key (industry) references public.industries(slug);
create index orgs_industry on public.orgs(industry) where industry is not null;

-- ---------- Search: the Industries filter ----------
-- Same as 040_agency_labels.sql, with one more filter at the end: industry keeps to companies in that industry.

drop function if exists public.search_jobs(text, text[], text, text, text, text, text[], text[], boolean, int, int, text, text, text, int, int, boolean, text);
drop function if exists public.search_jobs_count(text, text[], text, text, text, text, text[], text[], boolean, int, int, text, text, boolean, text);
drop function if exists public.search_matches(text, text[], text, text, text, text, text[], text[], boolean, int, int, text, text, boolean, text);

create or replace function public.search_matches(
  q text default null, workplaces text[] default null, country text default null, city text default null,
  category text default null, role text default null, seniorities text[] default null, types text[] default null,
  pay_only boolean default false, posted_days int default null, min_pay int default null,
  company text default null, region text default null, no_agency boolean default false, agency text default null,
  industry text default null
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
      and (search_matches.industry is null or o.industry = search_matches.industry)
$$;

create or replace function public.search_jobs(
  q text default null, workplaces text[] default null, country text default null, city text default null,
  category text default null, role text default null, seniorities text[] default null, types text[] default null,
  pay_only boolean default false, posted_days int default null, min_pay int default null,
  sort text default 'best', company text default null, region text default null,
  p_limit int default null, p_offset int default 0, no_agency boolean default false, agency text default null,
  industry text default null
) returns setof public.jobs
language sql stable security definer set search_path = public as $$
  with r as (
    select m.*, row_number() over (partition by m.org_id order by m.rank desc, m.published_at desc nulls last) as turn
    from search_matches(q, workplaces, country, city, category, role, seniorities, types, pay_only, posted_days,
      min_pay, company, region, no_agency, agency, industry) m
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
  company text default null, region text default null, no_agency boolean default false, agency text default null,
  industry text default null
) returns bigint
language sql stable security definer set search_path = public as $$
  select count(*) from search_matches(q, workplaces, country, city, category, role, seniorities, types, pay_only,
    posted_days, min_pay, company, region, no_agency, agency, industry)
$$;

-- Saved search alerts keep to the industry too.
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
      no_agency => coalesce((f->>'no_agency')::boolean, false),
      industry => f->>'industry'
    ) j
    where j.published_at > s.checked_at and not org_suspended(j.org_id)
    limit 10;
end $$;

notify pgrst, 'reload schema';
