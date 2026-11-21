-- Ocelot moved from the Hostinger KVM 2 (2 cores, throttled above a 30% daily CPU average) to the OVH SYS-1
-- (6 cores, 32 GB). deploy/trim-server.sh had paused discovery at 10,000 imported jobs and made every board sync
-- twice a week (84 hours). This puts both back to how they were before the trim:
--   - discovery runs again up to 25,000 imported jobs (migration 036)
--   - boards found in the crawl sync once a day; boards on the name list or added by Ocelot, every 6 hours
--     (migration 029)
-- Only boards still at the trim's 84 hours change, so a board someone set by hand keeps its own interval.

update public.app_settings set max_imported_jobs = 25000 where id and max_imported_jobs < 25000;

update public.job_sources s
set sync_hours = case
  when exists (select 1 from public.board_candidates c where c.source_id = s.id and c.found_by = 'crawl') then 24
  else 6
end
where s.sync_hours = 84;
