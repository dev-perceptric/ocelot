-- Find jobs: the companies directory and search suggestions. Both run as the caller (no security definer), so the
-- same row rules as search apply: only live jobs, and suspended companies stay hidden. A job listed more than once
-- (030_duplicates.sql) counts once.

-- Companies with live jobs and how many, most jobs first. Used by /companies and the "Companies hiring" row.
create or replace function public.hiring_companies(p_limit int default 500)
returns table (name text, slug text, logo_url text, jobs bigint)
language sql stable set search_path = public as $$
  select o.name, o.slug, o.logo_url, count(distinct coalesce(j.dupe_key, j.id::text)) as jobs
  from orgs o
  join jobs j on j.org_id = o.id and j.status = 'published'
  group by o.id
  order by jobs desc, lower(o.name)
  limit greatest(1, least(coalesce(p_limit, 500), 2000))
$$;

-- What the search box suggests while someone types: up to 6 job titles and 4 companies that match, with job counts.
create or replace function public.search_suggestions(p_q text)
returns table (kind text, label text, slug text, jobs bigint)
language sql stable set search_path = public as $$
  with t as (select nullif(trim(coalesce(p_q, '')), '') as q)
  (
    select 'title'::text, j.title, null::text, count(distinct coalesce(j.dupe_key, j.id::text))
    from jobs j cross join t
    where t.q is not null and length(t.q) >= 2 and j.status = 'published'
      and j.title ilike '%' || like_escape(t.q) || '%'
    group by j.title
    order by 4 desc, j.title
    limit 6
  )
  union all
  (
    select 'company'::text, o.name, o.slug, count(distinct coalesce(j.dupe_key, j.id::text))
    from orgs o
    join jobs j on j.org_id = o.id and j.status = 'published'
    cross join t
    where t.q is not null and length(t.q) >= 2 and o.name ilike '%' || like_escape(t.q) || '%'
    group by o.id
    order by 4 desc, lower(o.name)
    limit 4
  )
$$;

grant execute on function public.hiring_companies(int) to anon, authenticated;
grant execute on function public.search_suggestions(text) to anon, authenticated;
