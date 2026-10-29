-- The logo search now also reads job links, board logos, drawn (SVG) icons and .ico files: look again at every
-- company with a job board and no logo in the next hourly run.
update public.orgs set logo_checked_at = null where logo_url is null;
