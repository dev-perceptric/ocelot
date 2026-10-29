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
  if not ok then raise exception 'FAILED: %', what; end if;
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
select pg_temp.act('00000000-0000-0000-0000-00000000000c');
insert into tracker_items (user_id, job_id, title, company, notes)
  select auth.uid(), id, title, 'Acme', 'Ask about the team size' from jobs;
insert into tracker_items (user_id, title, company, url, notes)
  values (auth.uid(), 'Sales Lead', 'Elsewhere Co', 'https://example.com/job/1', 'Found on LinkedIn');
insert into applications (job_id, org_id, candidate_id, snapshot)
  select id, org_id, auth.uid(), '{"name":"Cam"}' from jobs;
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
select pg_temp.expect((select count(*) from jobs) = 0, 'an expired job is no longer public');
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
select pg_temp.fails(format($$insert into applications (job_id, org_id, candidate_id) values (%L, %L, auth.uid())$$, :'live_job', :'acme'), 'nobody can apply to a suspended company');
select pg_temp.act('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect((select count(*) from jobs where org_id = :'acme') > 0, 'members of a suspended company still see their own jobs');
select pg_temp.fails($$update orgs set suspended_at = null$$, 'a member cannot lift a suspension');
select pg_temp.fails($$select admin_counts()$$, 'people cannot read admin numbers');
reset role;
select pg_temp.expect((select (admin_counts()->>'companies')::int) >= 1, 'admin numbers work for the server');
\echo 'All boundary tests passed.'
