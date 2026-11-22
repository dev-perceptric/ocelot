-- The hourly count of jobs on each role and place page failed every run since 037_seo_more.sql: called through the
-- API, a delete with no where clause is refused (the safe-update guard), so new pages like /engineering-jobs never got
-- their counts. Same function, with "where true".

create or replace function public.refresh_seo_counts() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  -- "where true": the API's safe-update guard refuses a delete with no where clause.
  delete from seo_page_counts where true;
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
