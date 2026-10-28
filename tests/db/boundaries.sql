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

\echo 'All boundary tests passed.'
