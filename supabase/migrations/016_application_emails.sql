-- Milestone 4 part 3: application emails. Company members choose whether they get an email for each new applicant.
alter table public.notification_prefs add column new_applicants boolean not null default true;
