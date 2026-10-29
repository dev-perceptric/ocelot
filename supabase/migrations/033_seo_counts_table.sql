-- Page counts in a table. Counting every live job by area and place took about 4 seconds, past the visitor's
-- limit, so the hourly run counts once (refresh_seo_counts, server only) and pages read the table.
create table public.seo_page_counts (
  area text not null,
  place text not null,
  jobs int not null,
  primary key (area, place)
);
alter table public.seo_page_counts enable row level security;
create policy seo_page_counts_read on public.seo_page_counts for select using (true);

create or replace function public.refresh_seo_counts() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from seo_page_counts;
  insert into seo_page_counts (area, place, jobs)
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
  select a.a, p.p, count(*)::int from areas a join places p using (id) group by a.a, p.p;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.refresh_seo_counts() from public, anon, authenticated;


create or replace function public.seo_counts()
returns table (area text, place text, jobs int)
language sql stable set search_path = public as $$
  select area, place, jobs from seo_page_counts
$$;

select public.refresh_seo_counts();
