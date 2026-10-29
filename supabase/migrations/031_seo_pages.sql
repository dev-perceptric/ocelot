-- Role and place pages (/sales-jobs-in-texas). Counts of live jobs by area and place, one copy of each job,
-- for the pages' summaries, their links to each other and the sitemap. Runs as the caller, so suspended
-- companies stay out. Places: 'all', 'country:US', 'region:US-TX', 'city:austin', 'remote', and 'remote-in:US'
-- for remote jobs open to a whole country (a state's page counts those too).
create or replace function public.seo_counts()
returns table (area text, place text, jobs int)
language sql stable set search_path = public as $$
  with live as (
    select distinct on (dupe_key) id, category, role, workplace, eligible_countries, office_regions, office_places
    from jobs where status = 'published'
    order by dupe_key, (featured_until is not null and featured_until > now()) desc, (source <> 'ats') desc, published_at desc nulls last, length(description) desc, id
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
  )
  select a.a, p.p, count(*)::int from areas a join places p using (id) group by a.a, p.p
$$;

-- Live jobs for the sitemap: the copy search shows of each, newest first.
create or replace function public.sitemap_jobs()
returns table (slug text, published_at timestamptz)
language sql stable set search_path = public as $$
  select slug, published_at from (
    select distinct on (dupe_key) slug, published_at from jobs where status = 'published'
    order by dupe_key, (featured_until is not null and featured_until > now()) desc, (source <> 'ats') desc, published_at desc nulls last, length(description) desc, id
  ) s order by published_at desc nulls last, slug
$$;
