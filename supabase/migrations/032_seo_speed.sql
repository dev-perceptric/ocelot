-- The page counts and the sitemap's job list ran into the visitor's 3-second limit: the row rules check each job
-- one by one. They now run as the owner and apply the same rule themselves (published, with a date, from a
-- company that isn't suspended), with a matching index.
create index if not exists jobs_live_dupe on public.jobs (dupe_key) where status = 'published' and published_at is not null;

create or replace function public.seo_counts()
returns table (area text, place text, jobs int)
language sql stable security definer set search_path = public as $$
  with live as (
    select distinct on (dupe_key) j.id, j.category, j.role, j.workplace, j.eligible_countries, j.office_regions, j.office_places
    from jobs j join orgs o on o.id = j.org_id
    where j.status = 'published' and j.published_at is not null and o.suspended_at is null
    order by j.dupe_key, (j.featured_until is not null and j.featured_until > now()) desc, (j.source <> 'ats') desc, j.published_at desc nulls last, length(j.description) desc, j.id
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
language sql stable security definer set search_path = public as $$
  select slug, published_at from (
    select distinct on (j.dupe_key) j.slug, j.published_at from jobs j join orgs o on o.id = j.org_id
    where j.status = 'published' and j.published_at is not null and o.suspended_at is null
    order by j.dupe_key, (j.featured_until is not null and j.featured_until > now()) desc, (j.source <> 'ats') desc, j.published_at desc nulls last, length(j.description) desc, j.id
  ) s order by published_at desc nulls last, slug
$$;
