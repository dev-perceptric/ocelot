-- Duplicate jobs. The same job posted on two boards, or twice on one, shows once. Two jobs are the same when the
-- company (its name without words like "Inc"), the title (without place and workplace words: "Account Executive -
-- Remote, US" and "Account Executive (Remote US)" match), the workplace, the states, cities and countries all match.
-- Search shows one copy; the others keep their pages, which point search engines to the copy shown.

create or replace function public.company_key(n text) returns text
language sql immutable as $$
  select regexp_replace(regexp_replace(lower(coalesce(n, '')),
    '\m(inc|llc|ltd|limited|corp|corporation|co|company|labs?|hq|group|technologies|technology|the|careers?|jobs)\M', '', 'g'), '[^a-z0-9]+', '', 'g')
$$;

create or replace function public.job_title_key(t text) returns text
language sql immutable as $$
  select trim(regexp_replace(regexp_replace(lower(coalesce(t, '')),
    '\m(remote|hybrid|on-?site|in-?office|us|usa|u\.s\.?|united states|canada|north america|americas|nationwide|anywhere|full-?time|part-?time)\M', ' ', 'g'),
    '[^a-z0-9]+', ' ', 'g'))
$$;

alter table public.jobs add column dupe_key text;
create index jobs_dupe_key on public.jobs (dupe_key) where status = 'published';

create or replace function public.job_dupe_key() returns trigger
language plpgsql set search_path = public as $$
begin
  new.dupe_key := md5(concat_ws('|',
    company_key((select name from orgs where id = new.org_id)), job_title_key(new.title), coalesce(new.workplace, ''),
    array_to_string(array(select unnest(new.office_regions) order by 1), ','),
    array_to_string(array(select unnest(new.office_places) order by 1), ','),
    array_to_string(array(select unnest(new.eligible_countries) order by 1), ',')));
  return new;
end $$;
-- Named to run after jobs_regions (triggers run in name order), so the states are already filled in.
create trigger jobs_x_dupe_key before insert or update of title, org_id, workplace, office_places, office_regions, eligible_countries
  on public.jobs for each row execute function public.job_dupe_key();

-- A company's new name changes its jobs' keys. Runs as the owner: imported jobs refuse changes from companies.
create or replace function public.org_dupe_keys() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if company_key(new.name) is distinct from company_key(old.name) then
    update jobs set title = title where org_id = new.id;
  end if;
  return new;
end $$;
create trigger orgs_dupe_keys after update of name on public.orgs for each row execute function public.org_dupe_keys();

update public.jobs set title = title;

-- The copy of a job that search shows, for the pages of the other copies.
create or replace function public.shown_copy(p_key text) returns text
language sql stable set search_path = public as $$
  select slug from jobs where dupe_key = p_key and status = 'published'
  order by (featured_until is not null and featured_until > now()) desc, (source <> 'ats') desc, published_at desc nulls last, length(description) desc, id
  limit 1
$$;

create or replace function public.search_jobs(
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
    select j.id, j.org_id, j.published_at, j.dupe_key,
      (j.featured_until is not null and j.featured_until > now()) as featured,
      -- The copy shown when a job is listed more than once: promoted, then posted on Ocelot, then newest,
      -- then the one with the most text.
      row_number() over (partition by j.dupe_key order by (j.featured_until is not null and j.featured_until > now()) desc,
        (j.source <> 'ats') desc, j.published_at desc nulls last, length(j.description) desc, j.id) as copy,
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
    from m where m.copy = 1
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
