-- Ocelot shares its Supabase organization (and its Free plan's logs, egress and database limits) with Omniscient.
-- Imported jobs keep a fingerprint of what the board said, so the sync writes only jobs that changed. Discovery
-- stops adding boards at about today's size until Ocelot moves to its own organization.
alter table public.jobs add column source_hash text;
update public.app_settings set max_imported_jobs = 9000;
