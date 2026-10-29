-- Access boundary tests. Each block acts as one person and fails loudly if they see or change what they shouldn't.
-- People: Ana (employer at Acme), Ben (employer at Beta), Cam (candidate), Dee (another candidate).
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@acme.test'),
  ('00000000-0000-0000-0000-00000000000b', 'ben@beta.test'),
  ('00000000-0000-0000-0000-00000000000c', 'cam@mail.test'),
  ('00000000-0000-0000-0000-00000000000d', 'dee@mail.test');

create or replace function pg_temp.act(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
  if p is null then set role anon; else set role authenticated; end if;
end $$;

create or replace function pg_temp.expect(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;

create or replace function pg_temp.fails(stmt text, what text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok: %', what;
    return;
  end;
  raise exception 'FAILED (should have been blocked): %', what;
end $$;

-- Profiles were made by the signup trigger.
select pg_temp.expect((select count(*) from profiles) = 4, 'every new account gets a profile');

-- Ana makes Acme and a draft job. Ben makes Beta.
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
select create_org('Acme', 'acme');
insert into jobs (org_id, slug, title, created_by, workplace, eligible_countries)
  select id, 'acme-marketing-manager', 'Marketing Manager', auth.uid(), 'remote', '{VN}' from orgs where slug = 'acme';
select pg_temp.expect((select count(*) from jobs) = 1, 'Ana sees her draft');
select pg_temp.fails($$update jobs set status = 'published'$$, 'a member cannot publish a job themselves');
select pg_temp.fails($$update jobs set expires_at = now() + interval '90 days'$$, 'a member cannot change the end date');
select pg_temp.fails($$update jobs set status = 'pending_review'$$, 'an incomplete job cannot go to review');
update jobs set role = 'growth', seniority = 'mid', employment_type = 'full_time', description = repeat('Lead campaigns across Vietnam. ', 10);
update jobs set status = 'pending_review';
select pg_temp.fails(
  $$insert into jobs (org_id, slug, title, created_by, status) select id, 'x', 'X', auth.uid(), 'published' from orgs where slug = 'acme'$$,
  'a new job cannot start as published');
select pg_temp.fails($$update orgs set business_verified_at = now()$$, 'a member cannot mark their company verified');

reset role;
select id as acme from orgs where slug = 'acme' \gset
select pg_temp.act('00000000-0000-0000-0000-00000000000b');
select create_org('Beta', 'beta');
select pg_temp.expect((select count(*) from jobs) = 0, 'Ben cannot see Acme''s job under review');
select pg_temp.expect((select count(*) from orgs) = 1, 'Ben sees only his own company');
select pg_temp.fails(
  format($$insert into org_members (org_id, user_id, role) values (%L, '00000000-0000-0000-0000-00000000000b', 'member')$$, :'acme'),
  'Ben cannot add himself to Acme');

-- Visitors see nothing until review passes.
select pg_temp.act(null);
select pg_temp.expect((select count(*) from jobs) = 0, 'visitors cannot see a job under review');

-- Ocelot publishes it (server, service role).
reset role;
set role service_role;
update jobs set status = 'published', published_at = now(), expires_at = now() + interval '30 days';
reset role;

select pg_temp.act(null);
select pg_temp.expect((select count(*) from jobs) = 1, 'visitors see a published job');
select pg_temp.expect((select count(*) from orgs) = 1, 'visitors see the company of a published job');
select pg_temp.expect((select count(*) from org_members) = 0, 'visitors cannot see company members');

-- Cam saves the job, then applies. The saved card becomes Applied.
reset role;
insert into documents (user_id, name, storage_path, mime_type, size_bytes)
  values ('00000000-0000-0000-0000-00000000000c', 'Cam CV', '00000000-0000-0000-0000-00000000000c/cv.pdf', 'application/pdf', 1000) returning id as cam_cv \gset
update profiles set full_name = 'Cam Tran' where id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.act('00000000-0000-0000-0000-00000000000c');
insert into tracker_items (user_id, job_id, title, company, notes)
  select auth.uid(), id, title, 'Acme', 'Ask about the team size' from jobs;
insert into tracker_items (user_id, title, company, url, notes)
  values (auth.uid(), 'Sales Lead', 'Elsewhere Co', 'https://example.com/job/1', 'Found on LinkedIn');
select pg_temp.fails($$insert into applications (job_id, org_id, candidate_id, snapshot) select id, org_id, auth.uid(), '{"name":"Someone else"}' from jobs$$,
  'applications go through apply_to_job only, so nobody can write their own snapshot');
select apply_to_job((select id from jobs), :'cam_cv', '{}', 'Hello Acme');
select pg_temp.expect((select snapshot->>'name' = 'Cam Tran' and snapshot->>'note' = 'Hello Acme' and resume_id = :'cam_cv' from applications), 'the snapshot is built from the profile');
select pg_temp.expect((select stage from tracker_items where job_id is not null) = 'applied', 'applying moves the saved card to Applied');
select pg_temp.expect((select count(*) from tracker_items) = 2, 'applying links the saved card instead of adding another');
update applications set hiring_stage = 'hired';
select pg_temp.expect((select hiring_stage from applications) = 'new', 'a candidate cannot change the hiring stage');
select pg_temp.fails($$update applications set snapshot = '{}'$$, 'a candidate cannot edit what was sent');

-- Dee cannot see Cam's anything, and cannot apply as Cam.
select pg_temp.act('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect((select count(*) from tracker_items) = 0, 'Dee cannot see Cam''s tracker');
select pg_temp.expect((select count(*) from applications) = 0, 'Dee cannot see Cam''s application');
select pg_temp.expect((select count(*) from profiles) = 1, 'Dee sees only her own profile');
select pg_temp.fails(
  $$insert into applications (job_id, org_id, candidate_id) select id, org_id, '00000000-0000-0000-0000-00000000000c' from jobs$$,
  'Dee cannot apply in Cam''s name');

-- Ana sees the application and moves it. Cam's tracker stage stays where Cam put it.
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from applications) = 1, 'Ana sees the application sent to Acme');
select pg_temp.expect((select count(*) from tracker_items) = 0, 'Ana cannot see Cam''s tracker');
select pg_temp.expect((select count(*) from tracker_events) = 0, 'Ana cannot see Cam''s tracker history');
select pg_temp.expect((select count(*) from profiles) = 1, 'Ana cannot read Cam''s live profile');
update applications set hiring_stage = 'reviewing';
insert into application_notes (application_id, author_id, body) select id, auth.uid(), 'Strong writing sample' from applications;

select pg_temp.act('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select count(*) from applications) = 0, 'Ben cannot see Acme''s applications');
select pg_temp.expect((select count(*) from application_notes) = 0, 'Ben cannot see Acme''s notes');
select pg_temp.expect((select count(*) from application_events) = 0, 'Ben cannot see Acme''s hiring history');

select pg_temp.act('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select stage from tracker_items where job_id is not null) = 'applied', 'the employer''s stage never moves the candidate''s card');
select pg_temp.expect((select count(*) from application_notes) = 0, 'Cam cannot see the hiring notes');
select pg_temp.expect(not exists (select 1 from application_events where to_stage = 'reviewing'), 'Cam does not see the internal Reviewing step');

select pg_temp.act('00000000-0000-0000-0000-00000000000a');
update applications set hiring_stage = 'interviewing';
select pg_temp.act('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect(exists (select 1 from application_events where to_stage = 'interviewing'), 'Cam sees the interview invite');
select withdraw_application(id) from applications;
select pg_temp.expect((select hiring_stage from applications) = 'withdrawn', 'Cam can withdraw');

-- Server-only functions are closed to people.
select pg_temp.fails($$select expire_jobs()$$, 'people cannot run the expiry job');
select pg_temp.fails($$select * from claim_queue(1)$$, 'people cannot take queue tasks');
select pg_temp.expect((select count(*) from jobs_queue) = 0, 'people cannot read the queue');

-- Expiry closes a job past its end date, and it leaves the public list.
reset role;
update jobs set expires_at = now() - interval '1 minute';
select pg_temp.expect(expire_jobs() = 1, 'expiry closes one job');
select pg_temp.act(null);
select pg_temp.expect((select count(*) from jobs where status = 'published') = 0, 'an expired job leaves the live list');
select pg_temp.expect((select status from jobs) = 'expired', 'an expired job keeps its page, marked closed');
reset role;

-- ---------- Milestone 1, part G: lists, profiles, deleted candidates ----------

select pg_temp.act('00000000-0000-0000-0000-00000000000a');
select pg_temp.fails(
  format($$insert into jobs (org_id, slug, title, created_by, office_places) values (%L, 'g1', 'G1', auth.uid(), '{atlantis}')$$, :'acme'),
  'a job cannot use a city that is not on the list');
select pg_temp.fails(
  format($$insert into jobs (org_id, slug, title, created_by, eligible_countries) values (%L, 'g2', 'G2', auth.uid(), '{XX}')$$, :'acme'),
  'a job cannot use a country that is not on the list');
select pg_temp.fails(
  format($$insert into jobs (org_id, slug, title, created_by, salary_currency) values (%L, 'g3', 'G3', auth.uid(), 'EUR')$$, :'acme'),
  'a job cannot use a currency that is not on the list');
insert into jobs (org_id, slug, title, created_by, role, category, office_places, eligible_countries)
  values (:'acme', 'acme-seo-lead', 'SEO Lead', auth.uid(), 'seo', 'sales', '{ho-chi-minh-city}', '{VN,SG}');
select pg_temp.expect((select category from jobs where slug = 'acme-seo-lead') = 'marketing', 'a role sets its own category');

-- Changing a company's address keeps the old one; nobody else can take it.
update orgs set slug = 'acme-vn' where id = :'acme';
select pg_temp.expect(exists (select 1 from org_slug_history where slug = 'acme'), 'the old company address is kept');
select pg_temp.fails($$update orgs set office_places = '{atlantis}'$$, 'a company cannot use a city that is not on the list');
select pg_temp.fails($$update orgs set trusted = true$$, 'a member cannot mark their company trusted');
select pg_temp.act('00000000-0000-0000-0000-00000000000b');
select pg_temp.fails($$update orgs set slug = 'acme'$$, 'another company cannot take an old address');

-- Profiles: people edit what they share, never their email.
select pg_temp.act('00000000-0000-0000-0000-00000000000d');
update profiles set city = 'hanoi', work_countries = '{VN,SG}', open_to = '{remote}', languages = '{en,vi}' where id = auth.uid();
select pg_temp.expect((select country_code from profiles where id = auth.uid()) = 'VN', 'a city fills in its country');
select pg_temp.fails($$update profiles set email = 'x@y.z' where id = auth.uid()$$, 'a person cannot change the email on their profile');
select pg_temp.fails($$update profiles set work_countries = '{XX}' where id = auth.uid()$$, 'a profile cannot use a country that is not on the list');
select pg_temp.fails($$update profiles set open_to = '{anywhere}' where id = auth.uid()$$, 'open to only takes on-site, hybrid or remote');
insert into notification_prefs (user_id, weekly_digest) values (auth.uid(), true);

select pg_temp.act('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from notification_prefs) = 0, 'Cam cannot see Dee''s email choices');
select pg_temp.fails($$update applications set candidate_id = null$$, 'a candidate cannot detach their own application');

-- Cam deletes the account. Acme keeps the application without Cam's details; Cam's tracker is gone.
reset role;
insert into email_log (to_email, kind) values ('cam@mail.test', 'invite');
delete from auth.users where id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect((select count(*) from tracker_items) = 0, 'a deleted candidate''s tracker is gone');
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from applications) = 1, 'the company keeps the application');
select pg_temp.expect((select candidate_id is null and snapshot = '{"deleted": true}' and candidate_deleted_at is not null from applications),
  'the kept application has no candidate details');
select pg_temp.expect((select count(*) from documents) = 0, 'the résumé sent with it is gone too');
select pg_temp.expect((select count(*) from email_log) = 0, 'people cannot read the email log');
reset role;

-- ---------- Milestone 1, part B ----------
update auth.users set email = 'dee@new.test' where id = '00000000-0000-0000-0000-00000000000d';
select pg_temp.expect((select email from profiles where id = '00000000-0000-0000-0000-00000000000d') = 'dee@new.test',
  'a confirmed email change reaches the profile');
select pg_temp.act('00000000-0000-0000-0000-00000000000d');
update profiles set intent = 'candidate', full_name = 'Dee Nguyen' where id = auth.uid();
select pg_temp.expect((select intent from profiles where id = auth.uid()) = 'candidate', 'a person can set why they are here');
select pg_temp.fails($$update profiles set intent = 'recruiter' where id = auth.uid()$$, 'intent is only candidate or employer');
insert into notification_prefs (user_id, weekly_digest) values (auth.uid(), false)
  on conflict (user_id) do update set weekly_digest = excluded.weekly_digest;
select pg_temp.expect((select weekly_digest from notification_prefs where user_id = auth.uid()) = false, 'a person can change their email choices');
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
update profiles set full_name = 'Hacked' where id = '00000000-0000-0000-0000-00000000000d';
reset role;
select pg_temp.expect((select full_name from profiles where id = '00000000-0000-0000-0000-00000000000d') = 'Dee Nguyen', 'nobody else can edit a profile');
-- ---------- Milestone 1, part D: the queue ----------
reset role;
insert into jobs_queue (kind, payload) values ('email', '{"to":"a@b.c"}'), ('email', '{"to":"bad"}'), ('email', '{"to":"x@y.z"}');
select pg_temp.expect((select count(*) from claim_queue(10)) = 3, 'the worker takes due tasks');
select pg_temp.expect((select count(*) from claim_queue(10)) = 0, 'a taken task is not taken twice');
select finish_queue(id) from jobs_queue where payload->>'to' = 'a@b.c';
select finish_queue(id, 'resend 500') from jobs_queue where payload->>'to' = 'x@y.z';
select finish_queue(id, 'resend 422 invalid address', true) from jobs_queue where payload->>'to' = 'bad';
select pg_temp.expect((select done_at is not null and error is null from jobs_queue where payload->>'to' = 'a@b.c'), 'a sent task is done');
select pg_temp.expect((select done_at is null and run_at > now() from jobs_queue where payload->>'to' = 'x@y.z'), 'a failed task waits, then tries again');
select pg_temp.expect((select done_at is not null and error like 'resend 422%' from jobs_queue where payload->>'to' = 'bad'), 'a task that can never work stops');
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
select pg_temp.fails($$select finish_queue(1)$$, 'people cannot finish queue tasks');
reset role;
-- ---------- Milestone 1, part C: teams and invites ----------
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'fay@acme.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'gus@mail.test');

-- Email verified follows the website and members' email domains; free email never counts.
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
update orgs set website = 'https://www.acme.test/about' where id = :'acme';
select pg_temp.expect((select email_verified_domain from orgs where id = :'acme') = 'acme.test', 'a member on the company domain makes it Email verified');
update orgs set website = 'gmail.com' where id = :'acme';
select pg_temp.expect((select email_verified_domain is null from orgs where id = :'acme'), 'a free email domain never counts');
update orgs set website = 'acme.test' where id = :'acme';
select pg_temp.fails(format($$update orgs set email_verified_domain = 'evil.test' where id = %L$$, :'acme'), 'nobody sets Email verified by hand');

-- Ana invites Fay as an admin.
select create_invite(:'acme', 'Fay@Acme.test', 'admin') as fay_token \gset
select pg_temp.expect((select status = 'open' and company = 'Acme' and email = 'fay@acme.test' from invite_preview(:'fay_token')), 'the invite link shows the company');
select pg_temp.fails(format($$select create_invite(%L, 'x@y.z', 'owner')$$, :'acme'), 'nobody is invited as an owner');

select pg_temp.act('00000000-0000-0000-0000-00000000000b');
select pg_temp.fails(format($$select create_invite(%L, 'x@y.z')$$, :'acme'), 'another company cannot invite to Acme');
select pg_temp.expect((select count(*) from org_invites) = 0, 'another company cannot see Acme''s invites');
select pg_temp.fails($$insert into org_invites (org_id, email, token_hash) select id, 'x@y.z', 'h' from orgs$$, 'invites are only made through create_invite');

select pg_temp.act('00000000-0000-0000-0000-0000000000f2');
select pg_temp.fails(format($$select accept_invite(%L)$$, :'fay_token'), 'an invite cannot be accepted by someone else');
select pg_temp.act('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect(accept_invite(:'fay_token') = :'acme', 'Fay accepts her invite');
select pg_temp.expect((select role from org_members where org_id = :'acme' and user_id = auth.uid()) = 'admin', 'Fay joins with the invited role');
select pg_temp.fails(format($$select accept_invite(%L)$$, :'fay_token'), 'an invite link works once');

-- Admins can't touch owners or make themselves owner.
update org_members set role = 'member' where org_id = :'acme' and user_id = '00000000-0000-0000-0000-00000000000a';
delete from org_members where org_id = :'acme' and user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select role from org_members where org_id = :'acme' and user_id = '00000000-0000-0000-0000-00000000000a') = 'owner', 'an admin cannot demote or remove an owner');
select pg_temp.fails(format($$update org_members set role = 'owner' where org_id = %L and user_id = auth.uid()$$, :'acme'), 'an admin cannot make themself an owner');

-- Fay invites Gus as a member; Gus can't invite anyone.
select create_invite(:'acme', 'gus@mail.test') as gus_token \gset

select create_invite(:'acme', 'gus@mail.test') as gus_token \gset
select pg_temp.expect((select count(*) from org_invites where email = 'gus@mail.test' and revoked_at is null) = 1, 'a new invite to the same email replaces the old one');
select pg_temp.act('00000000-0000-0000-0000-0000000000f2');
select accept_invite(:'gus_token');
select pg_temp.fails(format($$select create_invite(%L, 'z@z.z')$$, :'acme'), 'a member cannot invite people');
select pg_temp.expect((select count(*) from org_invites) = 0, 'a member cannot see invites');
delete from org_members where org_id = :'acme' and user_id = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.expect((select count(*) from org_members where org_id = :'acme') = 3, 'a member cannot remove anyone');

update org_members set role = 'admin' where org_id = :'acme' and user_id = auth.uid();
select pg_temp.expect((select role from org_members where org_id = :'acme' and user_id = auth.uid()) = 'member', 'a member cannot promote themself');

-- The last owner stays until someone else is owner.
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
select pg_temp.fails(format($$delete from org_members where org_id = %L and user_id = auth.uid()$$, :'acme'), 'the last owner cannot leave');
select pg_temp.fails(format($$update org_members set role = 'admin' where org_id = %L and user_id = auth.uid()$$, :'acme'), 'the last owner cannot step down');
update org_members set role = 'owner' where org_id = :'acme' and user_id = '00000000-0000-0000-0000-0000000000f1';
update org_members set role = 'admin' where org_id = :'acme' and user_id = auth.uid();
select pg_temp.expect((select role from org_members where org_id = :'acme' and user_id = auth.uid()) = 'admin', 'an owner steps down once someone else is owner');

select pg_temp.expect((select count(*) from team_members(:'acme')) = 3, 'members see their teammates');
select pg_temp.act('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect((select count(*) from team_members(:'acme')) = 0, 'outsiders cannot list a team');

-- A member can leave on their own.
select pg_temp.act('00000000-0000-0000-0000-0000000000f2');
delete from org_members where org_id = :'acme' and user_id = auth.uid();
select pg_temp.expect((select count(*) from org_members where org_id = :'acme') = 0, 'Gus left and sees no members');

-- Expired and cancelled links stop working; there's a cap on open invites.
select pg_temp.act('00000000-0000-0000-0000-0000000000f1');
select create_invite(:'acme', 'dee@new.test') as dee_token \gset
reset role;
update org_invites set expires_at = now() - interval '1 minute' where email = 'dee@new.test';
select pg_temp.act('00000000-0000-0000-0000-00000000000d');
select pg_temp.fails(format($$select accept_invite(%L)$$, :'dee_token'), 'an expired invite stops working');
select pg_temp.act('00000000-0000-0000-0000-0000000000f1');
do $$ begin for i in 1..20 loop perform create_invite((select id from orgs where slug = 'acme-vn'), 'p' || i || '@cap.test'); end loop; end $$;
select pg_temp.fails(format($$select create_invite(%L, 'p21@cap.test')$$, :'acme'), 'a company has at most 20 open invites');
select revoke_invite(id) from org_invites where email = 'p1@cap.test';
select pg_temp.expect((select revoked_at is not null from org_invites where email = 'p1@cap.test'), 'an admin can cancel an invite');

-- Deleting a whole company is allowed even though it has owners.
reset role;
delete from orgs where slug = 'beta';
select pg_temp.expect(not exists (select 1 from org_members m where not exists (select 1 from orgs o where o.id = m.org_id)), 'deleting a company removes its members');
-- ---------- Milestone 1, part E: suspending a company ----------
reset role;
insert into jobs (org_id, slug, title, status, published_at) values (:'acme', 'acme-live', 'Live role', 'published', now());
select pg_temp.act(null);
select pg_temp.expect((select count(*) from jobs where slug = 'acme-live') = 1, 'a live job is public');
reset role;
update orgs set suspended_at = now(), suspended_reason = 'Fee scam reports' where id = :'acme';
select pg_temp.act(null);
select pg_temp.expect((select count(*) from jobs where org_id = :'acme') = 0, 'a suspended company''s jobs leave public pages');
select pg_temp.expect((select count(*) from orgs where id = :'acme') = 0, 'a suspended company leaves public pages');
select pg_temp.act('00000000-0000-0000-0000-00000000000d');
reset role;
select id as live_job from jobs where slug = 'acme-live' \gset
select pg_temp.act('00000000-0000-0000-0000-00000000000d');
select pg_temp.fails(format($$select apply_to_job(%L, gen_random_uuid())$$, :'live_job'), 'nobody can apply to a suspended company');
select pg_temp.act('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect((select count(*) from jobs where org_id = :'acme') > 0, 'members of a suspended company still see their own jobs');
select pg_temp.fails($$update orgs set suspended_at = null$$, 'a member cannot lift a suspension');
select pg_temp.fails($$select admin_counts()$$, 'people cannot read admin numbers');
reset role;
select pg_temp.expect((select (admin_counts()->>'companies')::int) >= 1, 'admin numbers work for the server');
-- ---------- Milestone 2, part 1: posting and review ----------
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a2', 'hanh@gamma.test');
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
select create_org('Gamma', 'gamma') as gamma \gset
insert into jobs (org_id, slug, title, created_by, role, seniority, employment_type, workplace, eligible_countries, description)
  values (:'gamma', 'gamma-sdr', 'SDR', auth.uid(), 'sdr', 'entry', 'full_time', 'hybrid', '{VN}', repeat('Book meetings with B2B buyers. ', 10));
select pg_temp.fails($$update jobs set status = 'pending_review' where slug = 'gamma-sdr'$$, 'a hybrid job needs its office city before review');
update jobs set office_places = '{hanoi}', salary_min = 800 where slug = 'gamma-sdr';
select pg_temp.fails($$update jobs set status = 'pending_review' where slug = 'gamma-sdr'$$, 'pay needs a currency and period before review');
update jobs set salary_currency = 'USD', salary_period = 'month' where slug = 'gamma-sdr';
update jobs set status = 'pending_review' where slug = 'gamma-sdr';
select pg_temp.expect((select status from jobs where slug = 'gamma-sdr') = 'pending_review', 'a complete job goes to review');
select pg_temp.fails($$select publish_job(id) from jobs where slug = 'gamma-sdr'$$, 'people cannot publish through the review function');
select pg_temp.fails($$update jobs set slug = 'cheaper-slug' where slug = 'gamma-sdr'$$, 'a member cannot change a job''s address');
select pg_temp.act(null);
select pg_temp.expect((select count(*) from jobs where slug = 'gamma-sdr') = 0, 'a job under review is not public');

-- Ocelot sends it back with a note; Hanh fixes it and sends it again; Ocelot publishes it.
reset role;
select pg_temp.fails($$select send_back_job(id, '') from jobs where slug = 'gamma-sdr'$$, 'sending back needs a note');
select send_back_job(id, 'Add the commission range.') from jobs where slug = 'gamma-sdr';
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect((select status = 'rejected' and review_note = 'Add the commission range.' from jobs where slug = 'gamma-sdr'), 'the company sees the reviewer''s note');
update jobs set description = description || ' Commission: 10-20% of first-year deals.', status = 'pending_review' where slug = 'gamma-sdr';
select pg_temp.expect((select status = 'pending_review' and review_note is null from jobs where slug = 'gamma-sdr'), 'a fixed job goes back to review and the note clears');
reset role;
select publish_job(id) from jobs where slug = 'gamma-sdr';
select pg_temp.expect((select status = 'published' and expires_at between now() + interval '29 days' and now() + interval '31 days' from jobs where slug = 'gamma-sdr'), 'publishing makes a job live for 30 days');
select pg_temp.fails($$select publish_job(id) from jobs where slug = 'gamma-sdr'$$, 'a job is published once');

-- Changing what candidates see on a live job sends it back to review.
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
update jobs set title = 'Senior SDR' where slug = 'gamma-sdr';
select pg_temp.expect((select status from jobs where slug = 'gamma-sdr') = 'pending_review', 'editing a live job sends it back to review');
delete from jobs where slug = 'gamma-sdr';
select pg_temp.expect((select count(*) from jobs where slug = 'gamma-sdr') = 1, 'a job that was published cannot be deleted');
reset role;
select publish_job(id) from jobs where slug = 'gamma-sdr';

-- Trusted companies publish without waiting, and can edit live jobs.
update orgs set trusted = true where id = :'gamma';
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
update jobs set title = 'Lead SDR' where slug = 'gamma-sdr';
select pg_temp.expect((select status from jobs where slug = 'gamma-sdr') = 'published', 'a trusted company edits a live job without review');
insert into jobs (org_id, slug, title, created_by, role, seniority, employment_type, workplace, eligible_countries, description)
  values (:'gamma', 'gamma-ae', 'Account Executive', auth.uid(), 'account_executive', 'mid', 'full_time', 'remote', '{VN,SG}', repeat('Close new business across the region. ', 8));
update jobs set status = 'pending_review' where slug = 'gamma-ae';
select pg_temp.expect((select status = 'published' and published_at is not null from jobs where slug = 'gamma-ae'), 'a trusted company publishes without waiting');

-- Closing keeps the page public; drafts stay private; drafts can be deleted.
update jobs set status = 'closed' where slug = 'gamma-ae';
insert into jobs (org_id, slug, title, created_by) values (:'gamma', 'gamma-draft', 'Draft role', auth.uid());
select pg_temp.act(null);
select pg_temp.expect((select status from jobs where slug = 'gamma-ae') = 'closed', 'a closed job keeps its public page');
select pg_temp.expect((select count(*) from orgs where id = :'gamma') = 1, 'its company stays public');
select pg_temp.expect((select count(*) from jobs where slug = 'gamma-draft') = 0, 'drafts are private');
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
delete from jobs where slug = 'gamma-draft';
select pg_temp.expect((select count(*) from jobs where slug = 'gamma-draft') = 0, 'a draft can be deleted');

-- Screening questions: up to 5, only by the company.
do $$ begin for i in 1..5 loop insert into job_questions (job_id, position, prompt) select id, i, 'Question number ' || i from jobs where slug = 'gamma-sdr'; end loop; end $$;
select pg_temp.fails($$insert into job_questions (job_id, prompt) select id, 'One too many' from jobs where slug = 'gamma-sdr'$$, 'a job has at most 5 questions');
select pg_temp.act('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect((select count(*) from job_questions jq join jobs j on j.id = jq.job_id where j.slug = 'gamma-sdr') = 5, 'anyone can read a live job''s questions');
select pg_temp.fails($$insert into job_questions (job_id, prompt) select id, 'Sneaky question' from jobs where slug = 'gamma-sdr'$$, 'outsiders cannot add questions');

-- A suspended company can't send jobs for review.
reset role;
update orgs set trusted = false, suspended_at = now() where id = :'gamma';
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
insert into jobs (org_id, slug, title, created_by, role, seniority, employment_type, workplace, eligible_countries, description)
  values (:'gamma', 'gamma-cs', 'CSM', auth.uid(), 'cs_manager', 'mid', 'full_time', 'remote', '{VN}', repeat('Keep customers happy and growing. ', 8));
select pg_temp.fails($$update jobs set status = 'pending_review' where slug = 'gamma-cs'$$, 'a suspended company cannot send jobs for review');
reset role;
-- ---------- Milestone 2, part 2: search ----------
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a3', 'tam@delta.test');
select pg_temp.act('00000000-0000-0000-0000-0000000000a3');
select create_org('Delta Analytics', 'delta') as delta \gset
reset role;
insert into jobs (org_id, slug, title, role, category, seniority, employment_type, workplace, office_places, eligible_countries, salary_min, salary_currency, salary_period, description, status, published_at, featured_until) values
  (:'delta', 'd-seo', 'SEO Specialist', 'seo', 'marketing', 'mid', 'full_time', 'remote', '{}', '{VN,SG}', 1200, 'USD', 'month', 'Technical SEO and content for SaaS.', 'published', now() - interval '3 days', null),
  (:'delta', 'd-ae', 'Account Executive', 'account_executive', 'sales', 'senior', 'full_time', 'hybrid', '{hanoi}', '{VN}', null, null, null, 'Close deals with enterprise buyers.', 'published', now() - interval '1 day', null),
  (:'delta', 'd-csm', 'Customer Success Manager', 'cs_manager', 'customer_success', 'mid', 'contract', 'on_site', '{singapore-city}', '{SG}', null, null, null, 'Onboard and grow accounts.', 'published', now() - interval '5 days', now() + interval '3 days'),
  (:'delta', 'd-draft', 'Secret SEO Draft', 'seo', 'marketing', 'mid', 'full_time', 'remote', '{}', '{VN}', null, null, null, 'Not live.', 'draft', null, null);
select pg_temp.act(null);
select pg_temp.expect((select array_agg(slug order by ord) from (select slug, row_number() over () as ord from search_jobs() where org_id = :'delta') s) = '{d-csm,d-ae,d-seo}', 'promoted first, then newest; drafts never show');
select pg_temp.expect((select array_agg(slug) from search_jobs(q => 'seo') where org_id = :'delta') = '{d-seo}', 'keywords match titles and descriptions');
select pg_temp.expect((select count(*) from search_jobs(q => 'delta analytics') where org_id = :'delta') = 3, 'keywords match the company name');
select pg_temp.expect((select count(*) from search_jobs(q => '100%_') where org_id = :'delta') = 0, 'search text is not treated as a pattern');
select pg_temp.expect((select array_agg(slug) from search_jobs(workplaces => '{remote,hybrid}', country => 'VN') where org_id = :'delta') @> '{d-seo,d-ae}'
  and (select count(*) from search_jobs(workplaces => '{remote,hybrid}', country => 'VN') where org_id = :'delta') = 2, 'workplace and country filters');
select pg_temp.expect((select array_agg(slug) from search_jobs(city => 'hanoi') where org_id = :'delta') = '{d-ae}', 'city filter');
select pg_temp.expect((select array_agg(slug) from search_jobs(category => 'customer_success', types => '{contract}') where org_id = :'delta') = '{d-csm}', 'category and type filters');
select pg_temp.expect((select array_agg(slug) from search_jobs(pay_only => true) where org_id = :'delta') = '{d-seo}', 'pay shown filter');
reset role;
update orgs set suspended_at = now() where id = :'delta';
select pg_temp.act(null);
select pg_temp.expect((select count(*) from search_jobs() where org_id = :'delta') = 0, 'a suspended company''s jobs leave search');
reset role;
-- ---------- Milestone 2, part 3: reports ----------
reset role;
update orgs set suspended_at = null where id = :'gamma';
select id as gamma_draft from jobs where slug = 'gamma-cs' \gset
select pg_temp.act('00000000-0000-0000-0000-00000000000d');
insert into reports (reporter_id, job_id, org_id, reason, details) select auth.uid(), id, org_id, 'fee_required', 'Asked me to pay for training.' from jobs where slug = 'gamma-sdr';
select pg_temp.fails($$insert into reports (reporter_id, job_id, org_id, reason) select auth.uid(), id, org_id, 'scam' from jobs where slug = 'gamma-sdr'$$, 'one open report per person per job');
select pg_temp.fails($$insert into reports (reporter_id, job_id, reason) select '00000000-0000-0000-0000-00000000000a', id, 'scam' from jobs where slug = 'gamma-sdr'$$, 'nobody reports in someone else''s name');
select pg_temp.fails($$insert into reports (reporter_id, job_id, reason, status) select auth.uid(), id, 'scam', 'dismissed' from jobs where slug = 'gamma-ae'$$, 'a report starts open');
select pg_temp.fails($$insert into reports (reporter_id, job_id, reason, admin_note) select auth.uid(), id, 'scam', 'pre-handled' from jobs where slug = 'gamma-ae'$$, 'reporters cannot write admin notes');
select pg_temp.fails(format($$insert into reports (reporter_id, job_id, reason) values (auth.uid(), %L, 'scam')$$, :'gamma_draft'), 'a draft job cannot be reported (it isn''t public)');
select pg_temp.expect((select count(*) from reports) = 1, 'a reporter sees their own report');
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect((select count(*) from reports) = 0, 'the reported company cannot see who reported it');
reset role;
-- ---------- Milestone 3, part 1: the tracker ----------
select pg_temp.act('00000000-0000-0000-0000-00000000000d');
select save_job(id) as saved_card from jobs where slug = 'gamma-sdr' \gset
select pg_temp.expect(save_job((select id from jobs where slug = 'gamma-sdr')) = :'saved_card', 'saving a job twice finds the same card');
select pg_temp.expect((select stage = 'saved' and title = 'Lead SDR' and company = 'Gamma' and location = 'Hybrid, Hanoi' from tracker_items where id = :'saved_card'), 'a saved card copies the listing');
select pg_temp.expect((select count(*) from tracker_events where item_id = :'saved_card' and kind = 'created') = 1, 'making a card is logged');
select pg_temp.fails(format($$select save_job(%L)$$, :'gamma_draft'), 'a job you cannot see cannot be saved');
select mark_applied(id) from jobs where slug = 'gamma-sdr';
select pg_temp.expect((select stage = 'applied' and applied_at is not null from tracker_items where id = :'saved_card'), 'Did you apply? Yes moves the card to Applied');
update tracker_items set stage = 'interviewing' where id = :'saved_card';
select mark_applied(id) from jobs where slug = 'gamma-sdr';
select pg_temp.expect((select stage from tracker_items where id = :'saved_card') = 'interviewing', 'a later Yes never moves a card backwards');
insert into tracker_items (user_id, title, company, url, notes) values (auth.uid(), 'Brand Lead', 'Elsewhere', 'https://elsewhere.test/jobs/1', 'Found on LinkedIn');
select pg_temp.fails($$insert into tracker_items (user_id, title, company, url) values (auth.uid(), 'Bad link', 'X', 'javascript:alert(1)')$$, 'a card link must be a web address');
select pg_temp.fails($$insert into tracker_items (user_id, title, company, contacts) values (auth.uid(), 'Bad contacts', 'X', '{"a":1}')$$, 'contacts are a list');
select pg_temp.fails($$insert into tracker_items (user_id, title, company) values ('00000000-0000-0000-0000-0000000000a2', 'Planted', 'X')$$, 'nobody adds cards to someone else''s tracker');
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect((select count(*) from tracker_items) = 0, 'the employer cannot see a candidate''s saved or applied cards');
select pg_temp.expect((select count(*) from tracker_events) = 0, 'or their history');
update tracker_items set notes = 'hacked';
reset role;
select pg_temp.expect((select notes from tracker_items where title = 'Brand Lead') = 'Found on LinkedIn', 'nobody else can edit a card');
-- ---------- Milestone 3, part 2: tasks and interviews ----------
select pg_temp.act('00000000-0000-0000-0000-00000000000d');
select id as brand_card from tracker_items where title = 'Brand Lead' \gset
insert into tasks (user_id, item_id, title, due_at) values (auth.uid(), :'brand_card', 'Follow up with Minh', now() + interval '2 days');
insert into tasks (user_id, title) values (auth.uid(), 'Update my CV');
select pg_temp.fails($$insert into tasks (user_id, title) values (auth.uid(), '   ')$$, 'a task needs a title');
insert into interviews (user_id, item_id, starts_at, title, meeting_url) values (auth.uid(), :'brand_card', now() + interval '3 days', 'Hiring manager', 'https://meet.test/abc');
select pg_temp.expect((select stage from tracker_items where id = :'brand_card') = 'interviewing', 'adding an interview moves a Saved card to Interviewing');
select pg_temp.expect((select count(*) from tracker_events where item_id = :'brand_card' and kind = 'interview') = 1, 'the interview is in the card''s history');
update tracker_items set stage = 'offer' where id = :'brand_card';
insert into interviews (user_id, item_id, starts_at) values (auth.uid(), :'brand_card', now() + interval '5 days');
select pg_temp.expect((select stage from tracker_items where id = :'brand_card') = 'offer', 'a later interview never moves a card backwards');
select pg_temp.fails(format($$insert into interviews (user_id, item_id, starts_at, meeting_url) values (auth.uid(), %L, now(), 'javascript:x')$$, :'brand_card'), 'a meeting link must be a web address');
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect((select count(*) from tasks) = 0 and (select count(*) from interviews) = 0, 'nobody else can see tasks or interviews');
select pg_temp.fails(format($$insert into tasks (user_id, item_id, title) values (auth.uid(), %L, 'Sneaky')$$, :'brand_card'), 'nobody can add a task to someone else''s card');
select pg_temp.fails(format($$insert into interviews (user_id, item_id, starts_at) values (auth.uid(), %L, now())$$, :'brand_card'), 'nobody can add an interview to someone else''s card');
reset role;
-- ---------- Milestone 3, part 3: résumés ----------
-- The server adds résumé rows after checking the file; people can't add their own.
select pg_temp.act('00000000-0000-0000-0000-00000000000d');
select pg_temp.fails($$insert into documents (user_id, name, storage_path, mime_type, size_bytes) values (auth.uid(), 'CV', auth.uid() || '/a.pdf', 'application/pdf', 100)$$, 'people cannot add a résumé without the server''s check');
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000e', 'eve@mail.test');
insert into documents (user_id, name, storage_path, mime_type, size_bytes)
  values ('00000000-0000-0000-0000-00000000000d', 'Dee CV 2026', '00000000-0000-0000-0000-00000000000d/a.pdf', 'application/pdf', 1000) returning id as dee_cv \gset
insert into documents (user_id, name, storage_path, mime_type, size_bytes)
  values ('00000000-0000-0000-0000-00000000000e', 'Eve CV', '00000000-0000-0000-0000-00000000000e/b.pdf', 'application/pdf', 1000) returning id as eve_cv \gset
select pg_temp.fails($$insert into documents (user_id, name, storage_path, mime_type, size_bytes) values ('00000000-0000-0000-0000-00000000000d', 'Not mine', '00000000-0000-0000-0000-00000000000e/c.pdf', 'application/pdf', 1000)$$, 'a résumé row must point inside its owner''s folder');
select pg_temp.act('00000000-0000-0000-0000-00000000000d');
update documents set name = 'Dee CV marketing' where id = :'dee_cv';
select pg_temp.expect((select name from documents where id = :'dee_cv') = 'Dee CV marketing', 'people can rename their résumés');
select pg_temp.fails(format($$update documents set storage_path = '00000000-0000-0000-0000-00000000000e/b.pdf' where id = %L$$, :'dee_cv'), 'and nothing else about them');
select pg_temp.expect((select count(*) from documents) = 1, 'people see only their own résumés');
update tracker_items set resume_id = :'dee_cv' where id = :'brand_card';
select pg_temp.expect((select resume_id from tracker_items where id = :'brand_card') = :'dee_cv', 'a card can show which résumé was used');
select pg_temp.fails(format($$update tracker_items set resume_id = %L where id = %L$$, :'eve_cv', :'brand_card'), 'a card cannot point at someone else''s résumé');
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect((select count(*) from documents) = 0, 'employers cannot see résumés that weren''t sent to them');
delete from documents;
select pg_temp.act('00000000-0000-0000-0000-00000000000e');
delete from documents where id = :'dee_cv';
select pg_temp.expect((select count(*) from documents) = 1, 'and another candidate sees only their own');
select pg_temp.act('00000000-0000-0000-0000-00000000000d');
delete from documents where id = :'dee_cv';
select pg_temp.expect((select resume_id is null from tracker_items where id = :'brand_card'), 'deleting a résumé clears it from cards');
reset role;
select pg_temp.expect((select count(*) from documents where user_id = '00000000-0000-0000-0000-00000000000e') = 1, 'nobody else can delete a résumé');
-- ---------- Milestone 4, part 1: applying ----------
reset role;
update orgs set suspended_at = null, trusted = true where id = :'gamma';
update job_questions set required = true where position = 1 and job_id = (select id from jobs where slug = 'gamma-sdr');
update profiles set full_name = 'Dee Pham', phone = '+84 90 123 4567' where id = '00000000-0000-0000-0000-00000000000d';
update profiles set full_name = 'Eve Le' where id = '00000000-0000-0000-0000-00000000000e';
insert into documents (user_id, name, storage_path, mime_type, size_bytes)
  values ('00000000-0000-0000-0000-00000000000d', 'Dee CV', '00000000-0000-0000-0000-00000000000d/m4.pdf', 'application/pdf', 1000) returning id as dee_m4 \gset
select id as sdr from jobs where slug = 'gamma-sdr' \gset
select id as ae from jobs where slug = 'gamma-ae' \gset
select jsonb_object_agg(id, 'Answer ' || position) as answers from job_questions where job_id = :'sdr' \gset
update profiles set full_name = 'Hanh Vo' where id = '00000000-0000-0000-0000-0000000000a2';
insert into documents (user_id, name, storage_path, mime_type, size_bytes)
  values ('00000000-0000-0000-0000-0000000000a2', 'Hanh CV', '00000000-0000-0000-0000-0000000000a2/cv.pdf', 'application/pdf', 1000) returning id as hanh_cv \gset
update jobs set expires_at = now() - interval '1 minute' where id = :'sdr';
select pg_temp.act('00000000-0000-0000-0000-00000000000d');
select pg_temp.fails(format($$select apply_to_job(%L, %L, %L)$$, :'sdr', :'dee_m4', :'answers'), 'a job past its end date takes no applications, even before the expiry job runs');
reset role;
update jobs set expires_at = now() + interval '20 days' where id = :'sdr';
select pg_temp.act(null);
select pg_temp.fails(format($$select apply_to_job(%L, %L)$$, :'sdr', :'dee_m4'), 'visitors cannot apply');
select pg_temp.act('00000000-0000-0000-0000-00000000000d');
select pg_temp.fails(format($$select apply_to_job(%L, %L, '{}')$$, :'sdr', :'dee_m4'), 'required questions need an answer');
select pg_temp.fails(format($$select apply_to_job(%L, %L, %L)$$, :'sdr', :'eve_cv', :'answers'), 'nobody can send someone else''s résumé');
select pg_temp.fails(format($$select apply_to_job(%L, %L, %L)$$, :'ae', :'dee_m4', :'answers'), 'a closed job takes no applications');
select pg_temp.fails(format($$select apply_to_job(%L, %L, %L, %L)$$, :'sdr', :'dee_m4', :'answers', repeat('x', 3001)), 'the note has a length limit');
select apply_to_job(:'sdr', :'dee_m4', :'answers', 'I led SDR teams before.') as dee_app \gset
select pg_temp.expect((select snapshot->>'name' = 'Dee Pham' and snapshot->>'phone' = '+84 90 123 4567' and snapshot->>'job_title' = 'Lead SDR'
  and jsonb_array_length(snapshot->'answers') = 5 and snapshot->'answers'->0->>'prompt' = 'Question number 1' and snapshot->'answers'->0->>'answer' = 'Answer 1'
  from applications where id = :'dee_app'), 'the snapshot holds the profile, the questions with answers and the job title');
select pg_temp.fails(format($$select apply_to_job(%L, %L, %L)$$, :'sdr', :'dee_m4', :'answers'), 'one application per job');
select pg_temp.expect((select application_id = :'dee_app' and stage = 'interviewing' and resume_id = :'dee_m4' from tracker_items where id = :'saved_card'),
  'applying links the saved card, keeps its stage and records the résumé');
update profiles set full_name = 'Dee Changed' where id = auth.uid();
select pg_temp.expect((select snapshot->>'name' from applications where id = :'dee_app') = 'Dee Pham', 'later profile edits never change what was sent');
update applications set hiring_stage = 'hired' where id = :'dee_app';
select pg_temp.expect((select hiring_stage from applications where id = :'dee_app') = 'new', 'the candidate cannot move the hiring stage');

-- The company: sees it, moves it, cannot withdraw it, and cannot apply to its own jobs.
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect((select count(*) from applications where id = :'dee_app') = 1, 'the company sees the application');
select pg_temp.expect((select count(*) from documents where id = :'dee_m4') = 1, 'and the résumé details sent with it');
select pg_temp.fails(format($$select apply_to_job(%L, %L, %L)$$, :'sdr', :'hanh_cv', :'answers'), 'a company member cannot apply to their own company''s job');
select pg_temp.fails(format($$update applications set hiring_stage = 'withdrawn' where id = %L$$, :'dee_app'), 'only the candidate can withdraw');
update applications set hiring_stage = 'interviewing' where id = :'dee_app';
select pg_temp.act('00000000-0000-0000-0000-0000000000a3');
select pg_temp.expect((select count(*) from applications) = 0 and (select count(*) from documents) = 0, 'other companies see nothing');

-- Deleting a sent résumé hides it and keeps it for the company.
select pg_temp.act('00000000-0000-0000-0000-00000000000d');
delete from documents where id = :'dee_m4';
select pg_temp.expect((select deleted_at is not null from documents where id = :'dee_m4'), 'a sent résumé is hidden, not removed');
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect((select count(*) from documents where id = :'dee_m4') = 1, 'the company keeps the résumé it got');

-- Withdrawing is final and moves the candidate's own card.
select pg_temp.act('00000000-0000-0000-0000-00000000000e');
select pg_temp.fails(format($$select withdraw_application(%L)$$, :'dee_app'), 'nobody can withdraw someone else''s application');
select pg_temp.act('00000000-0000-0000-0000-00000000000d');
select withdraw_application(:'dee_app');
select pg_temp.expect((select hiring_stage from applications where id = :'dee_app') = 'withdrawn', 'the candidate can withdraw');
select pg_temp.expect((select stage from tracker_items where id = :'saved_card') = 'withdrawn', 'withdrawing moves their card to Withdrawn');
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
select pg_temp.fails(format($$update applications set hiring_stage = 'offer' where id = %L$$, :'dee_app'), 'a withdrawn application cannot be moved');

-- A deleted account takes its sent résumés with it.
reset role;
insert into documents (user_id, name, storage_path, mime_type, size_bytes)
  values ('00000000-0000-0000-0000-00000000000e', 'Eve CV 2', '00000000-0000-0000-0000-00000000000e/m4.pdf', 'application/pdf', 1000) returning id as eve_m4 \gset
select pg_temp.act('00000000-0000-0000-0000-00000000000e');
select apply_to_job(:'sdr', :'eve_m4', :'answers') as eve_app \gset
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-00000000000e';
select pg_temp.expect((select count(*) from documents where user_id = '00000000-0000-0000-0000-00000000000e') = 0, 'deleting an account removes its sent résumés');
select pg_temp.expect((select candidate_id is null and resume_id is null and snapshot = '{"deleted": true}' from applications where id = :'eve_app'), 'and leaves the company a record without details');
-- ---------- Milestone 4, part 2: the applicant pipeline ----------
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a4', 'lan@gamma.test');
insert into org_members (org_id, user_id, role) values (:'gamma', '00000000-0000-0000-0000-0000000000a4', 'member');
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
insert into application_notes (application_id, author_id, body) values (:'dee_app', auth.uid(), 'Strong outbound numbers') returning id as hanh_note \gset
select pg_temp.fails(format($$insert into application_notes (application_id, author_id, body) values (%L, auth.uid(), '  ')$$, :'dee_app'), 'a note needs words');
select pg_temp.fails(format($$insert into application_notes (application_id, author_id, body) values (%L, '00000000-0000-0000-0000-0000000000a4', 'In Lan''s name')$$, :'dee_app'), 'nobody writes notes in a teammate''s name');
select pg_temp.fails(format($$update application_notes set body = 'Changed' where id = %L$$, :'hanh_note'), 'notes cannot be edited');
select pg_temp.act('00000000-0000-0000-0000-0000000000a4');
select pg_temp.expect((select count(*) from application_notes where id = :'hanh_note') = 1, 'teammates read each other''s notes');
delete from application_notes where id = :'hanh_note';
select pg_temp.expect((select count(*) from application_notes where id = :'hanh_note') = 1, 'but cannot delete them');
update applications set hiring_stage = 'reviewing' where id = :'eve_app';
select pg_temp.expect((select hiring_stage from applications where id = :'eve_app') = 'reviewing', 'any teammate can move an applicant');
select pg_temp.act('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect((select count(*) from application_notes) = 0, 'the candidate never sees hiring notes');
select pg_temp.act('00000000-0000-0000-0000-0000000000a3');
select pg_temp.expect((select count(*) from application_notes) = 0, 'other companies never see them');
select pg_temp.fails(format($$insert into application_notes (application_id, author_id, body) values (%L, auth.uid(), 'Sneaky')$$, :'dee_app'), 'other companies cannot add notes');
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
delete from application_notes where id = :'hanh_note';
select pg_temp.expect((select count(*) from application_notes where id = :'hanh_note') = 0, 'the author can delete their note');
-- Part 3: each person turns new applicant emails on or off for themselves only.
insert into notification_prefs (user_id, new_applicants) values (auth.uid(), false)
  on conflict (user_id) do update set new_applicants = false;
select pg_temp.expect((select new_applicants from notification_prefs where user_id = auth.uid()) = false, 'a member can turn off new applicant emails');
select pg_temp.act('00000000-0000-0000-0000-0000000000a4');
update notification_prefs set new_applicants = true;
reset role;
select pg_temp.expect((select new_applicants from notification_prefs where user_id = '00000000-0000-0000-0000-0000000000a2') = false, 'nobody changes a teammate''s email choices');
-- ---------- Milestone 5, part 1: listing credits and payment ----------
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a5', 'kai@zeta.test');
select set_payments(true);
select pg_temp.act('00000000-0000-0000-0000-0000000000a5');
select create_org('Zeta', 'zeta') as zeta \gset
create or replace function pg_temp.zeta_job(p_slug text) returns uuid language sql as $$
  insert into jobs (org_id, slug, title, created_by, role, seniority, employment_type, workplace, eligible_countries, description)
  select id, p_slug, 'Growth Marketer', auth.uid(), 'growth', 'mid', 'full_time', 'remote', '{VN}', repeat('Grow signups across Southeast Asia. ', 8)
  from orgs where slug = 'zeta' returning id $$;
select pg_temp.zeta_job('zeta-1') as z1 \gset
select pg_temp.expect((select payments_on from app_settings), 'everyone can see whether payments are on');
select pg_temp.fails(format($$update jobs set status = 'pending_review' where id = %L$$, :'z1'), 'with payments on, a job needs a credit to go to review');
select pg_temp.expect((select job_ready(:'z1')) is null, 'a complete job is ready');
select pg_temp.fails(format($$select attach_credit(%L)$$, :'z1'), 'no credit, nothing to attach');
select pg_temp.fails(format($$insert into entitlements (org_id, package) values (%L, 'founding')$$, :'zeta'), 'companies cannot give themselves credits');
select pg_temp.fails(format($$insert into orders (org_id, package) values (%L, 'standard')$$, :'zeta'), 'or write orders');
select pg_temp.fails(format($$select grant_credits(%L, 5, auth.uid())$$, :'zeta'), 'or call the founding credit function');
select pg_temp.fails(format($$select record_payment('evt_x', 'checkout.session.completed', gen_random_uuid(), 'cs_x', 4900, 'usd', 'pi_x')$$), 'or mark anything paid');
select pg_temp.fails($$select set_payments(false)$$, 'or turn payments off');
select pg_temp.fails($$update app_settings set payments_on = false$$, 'or change the setting directly');

reset role;
select grant_credits(:'zeta', 1, null);
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
select pg_temp.fails(format($$select attach_credit(%L)$$, :'z1'), 'another company cannot touch Zeta''s jobs or credits');
select pg_temp.expect((select count(*) from entitlements where org_id = :'zeta') = 0, 'or see them');
select pg_temp.act('00000000-0000-0000-0000-0000000000a5');
select pg_temp.expect((select count(*) from entitlements where job_id is null) = 1, 'the company sees its credit');
select pg_temp.expect(attach_credit(:'z1') = 'founding', 'a founding credit goes on the job');
select pg_temp.expect(attach_credit(:'z1') = 'founding', 'asking again keeps the same credit');
update jobs set status = 'pending_review' where id = :'z1';
select pg_temp.expect((select status from jobs where id = :'z1') = 'pending_review', 'with a credit, the job goes to review');
reset role;
select publish_job(:'z1');
select pg_temp.expect((select status = 'published' and featured_until is null from jobs where id = :'z1'), 'review passed and credit attached: the job is live');

-- A Featured payment through the webhook: the job goes to review by itself and is promoted for 7 days once live.
select pg_temp.act('00000000-0000-0000-0000-0000000000a5');
select pg_temp.zeta_job('zeta-2') as z2 \gset
reset role;
insert into orders (org_id, job_id, package, amount_cents, currency, stripe_session_id) values (:'zeta', :'z2', 'featured', 9900, 'USD', 'cs_2') returning id as o2 \gset
select pg_temp.expect(record_payment('evt_2', 'checkout.session.completed', :'o2', 'cs_2', 9900, 'usd', 'pi_2') = 'sent', 'a payment for a job sends it to review');
select pg_temp.expect(record_payment('evt_2', 'checkout.session.completed', :'o2', 'cs_2', 9900, 'usd', 'pi_2') = 'repeat', 'the same Stripe event is handled once');
select pg_temp.expect(record_payment('evt_2b', 'checkout.session.async_payment_succeeded', :'o2', 'cs_2', 9900, 'usd', 'pi_2') = 'already paid', 'a second event for a paid order adds nothing');
select pg_temp.expect((select count(*) from entitlements where order_id = :'o2') = 1, 'one credit per order');
select pg_temp.expect((select status from jobs where id = :'z2') = 'pending_review' and (select package from entitlements where job_id = :'z2') = 'featured', 'the job has its Featured credit');
select publish_job(:'z2');
select pg_temp.expect((select featured_until between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute' from jobs where id = :'z2'), 'Featured is promoted for 7 days from going live');

-- Payments that don't match are refused.
insert into orders (org_id, package, amount_cents, currency, stripe_session_id) values (:'zeta', 'standard', 4900, 'USD', 'cs_3') returning id as o3 \gset
select pg_temp.expect(record_payment('evt_3', 'checkout.session.completed', :'o3', 'cs_wrong', 4900, 'usd', 'pi_3') = 'no order', 'a payment from another checkout is ignored');
select pg_temp.expect(record_payment('evt_3b', 'checkout.session.completed', :'o3', 'cs_3', 100, 'usd', 'pi_3') = 'amount mismatch', 'a payment for the wrong amount is refused');
select pg_temp.expect((select status from orders where id = :'o3') = 'failed' and not exists (select 1 from entitlements where order_id = :'o3'), 'and adds no credit');

-- Refunds: only for listings that never went live. The job goes back to draft.
select pg_temp.act('00000000-0000-0000-0000-0000000000a5');
select pg_temp.zeta_job('zeta-4') as z4 \gset
reset role;
insert into orders (org_id, job_id, package, amount_cents, currency, stripe_session_id) values (:'zeta', :'z4', 'standard', 4900, 'USD', 'cs_4') returning id as o4 \gset
select record_payment('evt_4', 'checkout.session.completed', :'o4', 'cs_4', 4900, 'usd', 'pi_4');
select pg_temp.expect(can_refund(:'o4') and not can_refund(:'o2'), 'refunds are open only while the listing never went live');
select refund_order(:'o4');
select pg_temp.expect((select status from orders where id = :'o4') = 'refunded' and (select status from jobs where id = :'z4') = 'draft'
  and not exists (select 1 from entitlements where order_id = :'o4'), 'a refund removes the credit and moves the job back to draft');
select pg_temp.fails(format($$select refund_order(%L)$$, :'o2'), 'a listing that went live cannot be refunded');

-- A deleted draft gives its credit back.
select grant_credits(:'zeta', 1, null);
select pg_temp.act('00000000-0000-0000-0000-0000000000a5');
select attach_credit(:'z4');
delete from jobs where id = :'z4';
select pg_temp.expect((select count(*) from entitlements where job_id is null) = 1, 'deleting a draft returns its credit');

-- Live jobs aren't charged again; trusted companies still need a credit to publish a new job.
update jobs set title = 'Senior Growth Marketer' where id = :'z1';
select pg_temp.expect((select status from jobs where id = :'z1') = 'pending_review', 'editing a live job goes back to review without a new credit');
reset role;
update orgs set trusted = true where id = :'zeta';
select pg_temp.act('00000000-0000-0000-0000-0000000000a5');
select pg_temp.zeta_job('zeta-5') as z5 \gset
select pg_temp.zeta_job('zeta-6') as z6 \gset
select attach_credit(:'z5');
update jobs set status = 'pending_review' where id = :'z5';
select pg_temp.expect((select status from jobs where id = :'z5') = 'published', 'a trusted company publishes at once with a credit');
select pg_temp.fails(format($$update jobs set status = 'pending_review' where id = %L$$, :'z6'), 'and cannot publish without one');

-- With payments off, jobs need no credit.
reset role;
select set_payments(false);
select pg_temp.act('00000000-0000-0000-0000-0000000000a5');
update jobs set status = 'pending_review' where id = :'z6';
select pg_temp.expect((select status from jobs where id = :'z6') = 'published', 'with payments off, jobs go live without a credit');
reset role;
insert into orgs (name, slug) values ('Gone Co', 'gone-co') returning id as gone \gset
insert into orders (org_id, package, amount_cents, status) values (:'gone', 'standard', 4900, 'paid') returning id as gone_order \gset
delete from orgs where id = :'gone';
select pg_temp.expect((select org_id is null and org_name = 'Gone Co' from orders where id = :'gone_order'), 'orders stay as records when a company is deleted');
select pg_temp.act('00000000-0000-0000-0000-0000000000a5');
reset role;
select set_payments(true);
update orgs set trusted = false where id = :'zeta';
select pg_temp.act('00000000-0000-0000-0000-0000000000a5');
update jobs set title = 'Growth Lead' where id = :'z6';
select pg_temp.expect((select status from jobs where id = :'z6') = 'pending_review', 'a job that went live before payments were on is never charged for edits');
reset role;
select set_payments(false);
-- ---------- Milestone 5, part 3: alerts, digest and reminders ----------
select pg_temp.act('00000000-0000-0000-0000-00000000000d');
insert into saved_searches (user_id, name, filters, frequency) values (auth.uid(), 'Jobs in Vietnam', '{"country":"VN"}', 'weekly') returning id as dee_search \gset
select pg_temp.fails($$insert into saved_searches (user_id, name, filters) values (auth.uid(), '  ', '{}')$$, 'a saved search needs a name');
select pg_temp.fails($$insert into saved_searches (user_id, name, filters) values (auth.uid(), 'Bad', '[1]')$$, 'filters are an object');
select pg_temp.fails($$insert into saved_searches (user_id, name, filters) values ('00000000-0000-0000-0000-0000000000a2', 'Planted', '{}')$$, 'nobody saves searches for someone else');
select pg_temp.fails(format($$select * from alert_jobs(%L)$$, :'dee_search'), 'people cannot run alert queries');
select pg_temp.fails($$select * from due_alerts()$$, 'or list who gets alerts');
select pg_temp.fails($$select * from due_reminders()$$, 'or list task reminders');
select pg_temp.fails($$select * from due_digests()$$, 'or list digest readers');
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect((select count(*) from saved_searches) = 0, 'saved searches are private');

reset role;
update saved_searches set checked_at = now() - interval '8 days' where id = :'dee_search';
select pg_temp.expect(exists (select 1 from due_alerts() where id = :'dee_search'), 'a weekly search checked 8 days ago is due');
update saved_searches set checked_at = now() - interval '2 days' where id = :'dee_search';
select pg_temp.expect(not exists (select 1 from due_alerts() where id = :'dee_search'), 'a weekly search checked 2 days ago waits');
update saved_searches set checked_at = now() - interval '8 days' where id = :'dee_search';
select pg_temp.expect((select count(*) from alert_jobs(:'dee_search')) >= 1, 'it finds jobs published since it was checked');
select pg_temp.expect(not exists (select 1 from alert_jobs(:'dee_search') j where not ('VN' = any(j.eligible_countries)) or j.status <> 'published'),
  'only live jobs that match its filters');
update orgs set suspended_at = now() where id = :'zeta';
select pg_temp.expect(not exists (select 1 from alert_jobs(:'dee_search') j where j.org_id = :'zeta'), 'alerts leave out suspended companies');
update orgs set suspended_at = null where id = :'zeta';
update saved_searches set checked_at = now() + interval '1 minute' where id = :'dee_search';
select pg_temp.expect((select count(*) from alert_jobs(:'dee_search')) = 0, 'nothing new since the last check, nothing to send');
update saved_searches set frequency = 'daily', checked_at = now() - interval '1 hour' where id = :'dee_search';
select pg_temp.expect(not exists (select 1 from due_alerts() where id = :'dee_search'), 'a daily search checked an hour ago waits');
update saved_searches set frequency = 'off', checked_at = now() - interval '30 days' where id = :'dee_search';
select pg_temp.expect(not exists (select 1 from due_alerts() where id = :'dee_search'), 'a search set to off never sends');

-- Reminders: the morning a task is due, in the person's own time zone. 7 January 2030 is a Monday.
update profiles set time_zone = 'Asia/Ho_Chi_Minh' where id = '00000000-0000-0000-0000-00000000000d';
insert into tasks (user_id, title, due_at) values ('00000000-0000-0000-0000-00000000000d', 'Call Minh', '2030-01-07 10:00+07') returning id as call_task \gset
select pg_temp.expect(not exists (select 1 from due_reminders(500, '2030-01-07 07:30+07') where user_id = '00000000-0000-0000-0000-00000000000d'), 'no reminder before 8:00');
select pg_temp.expect((select tasks->0->>'title' from due_reminders(500, '2030-01-07 08:05+07') where user_id = '00000000-0000-0000-0000-00000000000d') = 'Call Minh', 'a reminder from 8:00 on the day');
select pg_temp.expect(not exists (select 1 from due_reminders(500, '2030-01-06 09:00+07') where user_id = '00000000-0000-0000-0000-00000000000d'), 'not the day before');
update tasks set reminded_at = now() where id = :'call_task';
select pg_temp.expect(not exists (select 1 from due_reminders(500, '2030-01-07 09:00+07') where user_id = '00000000-0000-0000-0000-00000000000d'), 'each task is reminded once');

-- The digest: Mondays from 8:00 in the person's time zone, once a week, only for people who turned it on.
insert into notification_prefs (user_id, weekly_digest) values ('00000000-0000-0000-0000-00000000000d', true)
  on conflict (user_id) do update set weekly_digest = true, digest_sent_at = null;
select pg_temp.expect(exists (select 1 from due_digests(1000, '2030-01-07 08:30+07') where user_id = '00000000-0000-0000-0000-00000000000d'), 'the digest goes Monday morning');
select pg_temp.expect(not exists (select 1 from due_digests(1000, '2030-01-08 09:00+07') where user_id = '00000000-0000-0000-0000-00000000000d'), 'not on Tuesday');
update notification_prefs set digest_sent_at = '2030-01-07 08:31+07' where user_id = '00000000-0000-0000-0000-00000000000d';
select pg_temp.expect(not exists (select 1 from due_digests(1000, '2030-01-07 09:30+07') where user_id = '00000000-0000-0000-0000-00000000000d'), 'once a week');
update notification_prefs set weekly_digest = false, digest_sent_at = null where user_id = '00000000-0000-0000-0000-00000000000d';
select pg_temp.expect(not exists (select 1 from due_digests(1000, '2030-01-07 08:30+07') where user_id = '00000000-0000-0000-0000-00000000000d'), 'never when turned off');
-- ---------- Job board sync ----------
reset role;
insert into job_sources (org_id, provider, board) values (:'gamma', 'greenhouse', 'gamma') returning id as src \gset
select pg_temp.fails($$insert into job_sources (org_id, provider, board) values (gen_random_uuid(), 'greenhouse', 'bad board/../x')$$, 'a board name is a plain name');
select pg_temp.fails(format($$insert into job_sources (org_id, provider, board) values (%L, 'greenhouse', 'gamma')$$, :'gamma'), 'each board is added once');
insert into jobs (org_id, slug, title, description, status, published_at, expires_at, source, source_id, external_id, apply_method, apply_url, eligible_countries, workplace)
  values (:'gamma', 'gamma-gh-1', 'Growth Marketer', 'Imported.', 'published', now(), now() + interval '30 days', 'ats', :'src', '101', 'external', 'https://boards.greenhouse.io/gamma/jobs/101', '{VN}', 'remote')
  returning id as gh1 \gset
select pg_temp.fails(format($$insert into jobs (org_id, slug, title, source, source_id, external_id, apply_method, apply_url) values (%L, 'gamma-gh-dup', 'Dup', 'ats', %L, '101', 'external', 'https://x.test')$$, :'gamma', :'src'), 'a board job is imported once');
select pg_temp.fails(format($$insert into jobs (org_id, slug, title, source, apply_method) values (%L, 'gamma-gh-2', 'No id', 'ats', 'external')$$, :'gamma'), 'an imported job keeps its board id');
select pg_temp.fails(format($$insert into jobs (org_id, slug, title, source, source_id, external_id, apply_method) values (%L, 'gamma-gh-3', 'On Ocelot', 'ats', %L, '103', 'ocelot')$$, :'gamma', :'src'), 'imported jobs apply on the company site');
select pg_temp.expect(exists (select 1 from due_sources() where id = :'src'), 'a new source syncs right away');
update job_sources set last_synced_at = now() - interval '1 hour' where id = :'src';
select pg_temp.expect(not exists (select 1 from due_sources() where id = :'src'), 'then waits 6 hours');
update job_sources set last_synced_at = now() - interval '7 hours' where id = :'src';
select pg_temp.expect(exists (select 1 from due_sources() where id = :'src'), 'and syncs again after');
update job_sources set active = false where id = :'src';
select pg_temp.expect(not exists (select 1 from due_sources() where id = :'src'), 'a paused source never syncs');

select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect((select count(*) from job_sources) = 0, 'companies cannot see the sources list');
select pg_temp.fails(format($$insert into job_sources (org_id, provider, board) values (%L, 'lever', 'gamma')$$, :'gamma'), 'or add sources');
select pg_temp.fails($$select * from due_sources()$$, 'or run the sync list');
select pg_temp.fails(format($$update jobs set title = 'Changed' where id = %L$$, :'gh1'), 'the company cannot edit an imported job');
update jobs set status = 'closed' where id = :'gh1';
select pg_temp.expect((select status = 'closed' and closed_by_company from jobs where id = :'gh1'), 'but can close it');
reset role;
-- ---------- Job board discovery ----------
reset role;
select pg_temp.expect((select count(*) from board_candidates) > 400, 'the list of companies to look for is filled in');
insert into orgs (name, slug) values ('Lumen Labs', 'lumen-labs');
select pg_temp.expect((select name from board_candidates where slug = 'lumenlabs') = 'Lumen Labs', 'a new company on Ocelot is looked for too');
update board_candidates set checked_at = now();
select pg_temp.expect(not exists (select 1 from due_candidates()), 'names checked this week wait');
update board_candidates set checked_at = now() - interval '8 days' where slug in ('stripe', 'lumenlabs');
select pg_temp.expect((select array_agg(slug order by slug) from due_candidates()) = '{lumenlabs,stripe}', 'and are checked again after a week');
update board_candidates set skip = true where slug = 'lumenlabs';
update board_candidates set source_id = :'src' where slug = 'stripe';
select pg_temp.expect(not exists (select 1 from due_candidates()), 'boards already added, or deleted by Ocelot, are not looked for');
select pg_temp.fails($$insert into board_candidates (slug, name) values ('Bad Slug!', 'x')$$, 'names on the list are plain board names');
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect((select count(*) from board_candidates) = 0, 'companies cannot see the list');
select pg_temp.fails($$insert into board_candidates (slug, name) values ('sneaky', 'Sneaky')$$, 'or add to it');
select pg_temp.fails($$select * from due_candidates()$$, 'or run it');
reset role;
-- ---------- US and Canada first ----------
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b9', 'nora@mail.test');
select pg_temp.expect((select time_zone from profiles where id = '00000000-0000-0000-0000-0000000000b9') = 'America/New_York', 'new accounts start in New York time');
select pg_temp.expect((select count(*) from places where kind = 'city' and country_code in ('US', 'CA')) >= 30, 'US and Canadian cities are on the list');
select pg_temp.expect((select slug from places where kind = 'country' order by sort limit 1) = 'united-states', 'the United States comes first');
select pg_temp.act('00000000-0000-0000-0000-0000000000b9');
update profiles set salary_hope_min = 90000, salary_hope_currency = 'CAD', salary_hope_period = 'year', city = 'toronto' where id = auth.uid();
select pg_temp.expect((select salary_hope_currency = 'CAD' and country_code = 'CA' from profiles where id = auth.uid()), 'pay in CAD and Canadian cities work on profiles');
select pg_temp.fails($$update profiles set salary_hope_currency = 'XYZ' where id = auth.uid()$$, 'unknown currencies are still refused');
reset role;
select pg_temp.expect((select count(*) from job_sources where countries <> '{US,CA}') = 0, 'every job board now looks for US and Canadian jobs');
-- ---------- The hourly run's pass ----------
reset role;
insert into cron_passes (token) values (repeat('a', 48));
insert into cron_passes (token, created_at) values (repeat('b', 48), now() - interval '10 minutes');
select pg_temp.expect(take_cron_pass(repeat('a', 48)), 'a fresh pass works');
select pg_temp.expect(not take_cron_pass(repeat('a', 48)), 'once');
select pg_temp.expect(not take_cron_pass(repeat('b', 48)), 'an old pass does not');
select pg_temp.expect(not take_cron_pass(repeat('c', 48)), 'nor a made-up one');
select pg_temp.act('00000000-0000-0000-0000-0000000000a2');
select pg_temp.fails($$insert into cron_passes (token) values (repeat('d', 48))$$, 'people cannot make passes');
select pg_temp.fails($$select take_cron_pass(repeat('d', 48))$$, 'or use them');
select pg_temp.fails($$update app_settings set last_cron_at = now() where id$$, 'or change the run record');
reset role;
\echo 'All boundary tests passed.'
