-- Wrong boards on the look-for list. Some names on the starting list came from a board that belongs to a
-- different company (the "wise" Greenhouse board is Wise Benefits, the "meta" Recruitee board is a stray post),
-- or to a test page. Those names go back to the company Ocelot looks for, with no board, so discovery checks
-- again with its name check. The two boards that brought in jobs are removed with their companies (imported
-- companies with no team of their own) and jobs.

with bad(slug, name) as (values
  ('meta', 'Meta'), ('wise', 'Wise'), ('disney', 'Disney'), ('hetzner', 'Hetzner'), ('be', 'Be'),
  ('personio', 'Personio'), ('easypost', 'EasyPost'))
update public.board_candidates c set name = bad.name, provider = null, board = null, source_id = null, checked_at = null
from bad where c.slug = bad.slug;

delete from public.orgs o
using public.job_sources s
where s.org_id = o.id and (s.provider, lower(s.board)) in (('recruitee', 'meta'), ('greenhouse', 'wise'))
  and not exists (select 1 from public.org_members m where m.org_id = o.id);
delete from public.job_sources where (provider, lower(board)) in (('recruitee', 'meta'), ('greenhouse', 'wise'));

-- Page names as company names ("HackerRank Careers" -> "HackerRank"), for imported companies.
update public.orgs o set name = trim(regexp_replace(o.name, '[\s,|–—-]+(careers?|jobs?|job board|hiring|career site|careers page)\s*$', '', 'i'))
where o.name ~* '[\s,|–—-]+(careers?|jobs?|job board|hiring|career site|careers page)\s*$'
  and exists (select 1 from public.job_sources s where s.org_id = o.id)
  and not exists (select 1 from public.org_members m where m.org_id = o.id);
update public.orgs set name = trim(name) where name <> trim(name);
