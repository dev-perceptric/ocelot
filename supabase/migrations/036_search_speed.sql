-- Search speed for 50,000+ live jobs.
--
-- Search used to rank every live job on each request to pick the copy shown when a job is listed more than once
-- (030_duplicates.sql). That choice is now kept in jobs.shown, updated when a job changes and once an hour (a
-- promotion can end with no change to the row). Search, the companies directory and suggestions read it.
-- Trigram indexes make the search box's "contains" matches fast. Imported jobs may grow to 25,000 (was 9,000,
-- while Ocelot shared a Supabase Free plan; it has its own database on the VPS now).

alter table public.jobs add column shown boolean not null default false;

-- Picks the shown copy for these duplicate groups (all groups when null). Same order as before: promoted, then posted
-- on Ocelot, then newest, then the one with the most text. Runs as the owner: companies can't choose it.
-- Every job gets a dupe_key before it is saved (030_duplicates.sql), so groups are found through its index.
create or replace function public.refresh_shown(p_keys text[] default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  with ranked as (
    select id, row_number() over (partition by coalesce(dupe_key, id::text)
        order by (featured_until is not null and featured_until > now()) desc, (source <> 'ats') desc,
          published_at desc nulls last, length(description) desc, id) = 1 as want
    from jobs
    where status = 'published' and (p_keys is null or dupe_key = any(p_keys))
  )
  update jobs j set shown = r.want from ranked r where r.id = j.id and j.shown is distinct from r.want;
  -- Jobs that stopped being live lose shown when saved (jobs_keep_shown); the full pass also sweeps any left over.
  if p_keys is null then
    update jobs set shown = false where shown and status <> 'published';
  end if;
end $$;
revoke execute on function public.refresh_shown(text[]) from public, anon, authenticated;
grant execute on function public.refresh_shown(text[]) to service_role;

-- Only live jobs are shown, and a company member can't set shown themselves; the trigger below sets it.
create or replace function public.jobs_keep_shown() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status <> 'published' then
    new.shown := false;
  elsif current_user in ('authenticated', 'anon') then
    new.shown := case when tg_op = 'INSERT' then false else old.shown end;
  end if;
  return new;
end $$;
create trigger jobs_keep_shown before insert or update on public.jobs for each row execute function public.jobs_keep_shown();

-- After a job is added or changes in a way that can change the shown copy, recheck its group (and its old group).
create or replace function public.jobs_refresh_shown() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  declare keys text[] := array_remove(array[new.dupe_key, case when tg_op = 'UPDATE' then old.dupe_key end], null);
  begin
    if cardinality(keys) > 0 then perform refresh_shown(keys); end if;
  end;
  return null;
end $$;
-- Compares values instead of naming columns: dupe_key is often changed by a trigger (a new title), not by the update.
create trigger jobs_refresh_shown_insert after insert on public.jobs for each row execute function public.jobs_refresh_shown();
create trigger jobs_refresh_shown_update after update on public.jobs for each row
  when ((old.status, old.featured_until, old.published_at, old.source, old.description, old.dupe_key)
    is distinct from (new.status, new.featured_until, new.published_at, new.source, new.description, new.dupe_key))
  execute function public.jobs_refresh_shown();

-- Every job's copy, now.
select public.refresh_shown();

create index if not exists jobs_shown_live on public.jobs (org_id, published_at desc) where status = 'published' and shown;

-- "Contains" matches on titles (the search box and suggestions), wherever pg_trgm lives. Company names already have
-- one (009_search.sql).
do $$
declare s text := (select extnamespace::regnamespace::text from pg_extension where extname = 'pg_trgm');
begin
  execute format('create index if not exists jobs_title_trgm on public.jobs using gin (title %I.gin_trgm_ops) where status = %L', s, 'published');
end $$;

-- Search. Checking the row rules job by job (is the visitor a member of this company? is it suspended?) was most
-- of search's time, so these run as the owner and apply what any visitor may see themselves: live jobs from
-- companies that aren't suspended, one copy of each. They return nothing else.

drop function if exists public.search_jobs(text, text[], text, text, text, text, text[], text[], boolean, int, int, text, text, text);

-- The jobs a search matches, as a short row each: what search sorts and counts.
create or replace function public.search_matches(
  q text default null, workplaces text[] default null, country text default null, city text default null,
  category text default null, role text default null, seniorities text[] default null, types text[] default null,
  pay_only boolean default false, posted_days int default null, min_pay int default null,
  company text default null, region text default null
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
      -- A state or province: offices there, plus remote jobs open to the whole country.
      and (search_matches.region is null or j.office_regions @> array[search_matches.region]
           or (j.workplace = 'remote' and cardinality(j.office_regions) = 0 and j.eligible_countries @> array[left(search_matches.region, 2)]))
      and (posted_days is null or j.published_at > now() - make_interval(days => posted_days))
      and (min_pay is null or (j.salary_period = 'year' and coalesce(j.salary_max, j.salary_min) >= min_pay))
$$;

-- One page of a search (all of it when p_limit is null), in order: promoted first, then taking turns between
-- companies (each company's best job, then each one's second...), best match, a daily mix between companies, newest.
-- Only the page's jobs are read in full.
create or replace function public.search_jobs(
  q text default null, workplaces text[] default null, country text default null, city text default null,
  category text default null, role text default null, seniorities text[] default null, types text[] default null,
  pay_only boolean default false, posted_days int default null, min_pay int default null,
  sort text default 'best', company text default null, region text default null,
  p_limit int default null, p_offset int default 0
) returns setof public.jobs
language sql stable security definer set search_path = public as $$
  with r as (
    select m.*, row_number() over (partition by m.org_id order by m.rank desc, m.published_at desc nulls last) as turn
    from search_matches(q, workplaces, country, city, category, role, seniorities, types, pay_only, posted_days,
      min_pay, company, region) m
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

-- How many jobs a search finds, without sorting or reading them.
create or replace function public.search_jobs_count(
  q text default null, workplaces text[] default null, country text default null, city text default null,
  category text default null, role text default null, seniorities text[] default null, types text[] default null,
  pay_only boolean default false, posted_days int default null, min_pay int default null,
  company text default null, region text default null
) returns bigint
language sql stable security definer set search_path = public as $$
  select count(*) from search_matches(q, workplaces, country, city, category, role, seniorities, types, pay_only,
    posted_days, min_pay, company, region)
$$;

-- The companies directory and suggestions: the same visitor rule, counting the shown copies.
create or replace function public.hiring_companies(p_limit int default 500)
returns table (name text, slug text, logo_url text, jobs bigint)
language sql stable security definer set search_path = public as $$
  select o.name, o.slug, o.logo_url, count(*) as jobs
  from orgs o
  join jobs j on j.org_id = o.id and j.status = 'published' and j.published_at is not null and j.shown
  where o.suspended_at is null
  group by o.id
  order by jobs desc, lower(o.name)
  limit greatest(1, least(coalesce(p_limit, 5000), 5000))
$$;

create or replace function public.search_suggestions(p_q text)
returns table (kind text, label text, slug text, jobs bigint)
language sql stable security definer set search_path = public as $$
  (
    select 'title'::text, j.title, null::text, count(*)
    from jobs j
    join orgs o on o.id = j.org_id and o.suspended_at is null
    where length(trim(coalesce(p_q, ''))) >= 2 and j.status = 'published' and j.published_at is not null and j.shown
      and j.title ilike '%' || like_escape(trim(p_q)) || '%'
    group by j.title
    order by 4 desc, j.title
    limit 6
  )
  union all
  (
    select 'company'::text, o.name, o.slug, count(*)
    from orgs o
    join jobs j on j.org_id = o.id and j.status = 'published' and j.published_at is not null and j.shown
    where length(trim(coalesce(p_q, ''))) >= 2 and o.suspended_at is null
      and o.name ilike '%' || like_escape(trim(p_q)) || '%'
    group by o.id
    order by 4 desc, lower(o.name)
    limit 4
  )
$$;

update public.app_settings set max_imported_jobs = 25000;

-- Tell the API about the new functions.
notify pgrst, 'reload schema';
