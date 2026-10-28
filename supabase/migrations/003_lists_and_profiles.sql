-- Milestone 1, part G: fixed lists later milestones depend on, the fuller candidate profile, and what happens to
-- applications when a candidate deletes their account. src/lib/places.ts and src/lib/taxonomy.ts mirror the lists
-- here; tests/lists.test.ts fails if they drift apart.

-- ---------- Places: countries and the cities jobs and companies point to ----------

create table public.places (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind text not null check (kind in ('country', 'city')),
  name text not null,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  sort int not null default 100
);
create unique index places_country_code on public.places(country_code) where kind = 'country';

insert into public.places (slug, kind, name, country_code, sort) values
  ('vietnam', 'country', 'Vietnam', 'VN', 1),
  ('singapore', 'country', 'Singapore', 'SG', 2),
  ('thailand', 'country', 'Thailand', 'TH', 3),
  ('malaysia', 'country', 'Malaysia', 'MY', 4),
  ('indonesia', 'country', 'Indonesia', 'ID', 5),
  ('philippines', 'country', 'Philippines', 'PH', 6),
  ('cambodia', 'country', 'Cambodia', 'KH', 7),
  ('laos', 'country', 'Laos', 'LA', 8),
  ('myanmar', 'country', 'Myanmar', 'MM', 9),
  ('brunei', 'country', 'Brunei', 'BN', 10),
  ('hong-kong', 'country', 'Hong Kong', 'HK', 20),
  ('taiwan', 'country', 'Taiwan', 'TW', 21),
  ('japan', 'country', 'Japan', 'JP', 22),
  ('south-korea', 'country', 'South Korea', 'KR', 23),
  ('india', 'country', 'India', 'IN', 24),
  ('australia', 'country', 'Australia', 'AU', 25),
  ('new-zealand', 'country', 'New Zealand', 'NZ', 26),
  ('united-arab-emirates', 'country', 'United Arab Emirates', 'AE', 27),
  ('united-kingdom', 'country', 'United Kingdom', 'GB', 30),
  ('ireland', 'country', 'Ireland', 'IE', 31),
  ('germany', 'country', 'Germany', 'DE', 32),
  ('netherlands', 'country', 'Netherlands', 'NL', 33),
  ('france', 'country', 'France', 'FR', 34),
  ('united-states', 'country', 'United States', 'US', 40),
  ('canada', 'country', 'Canada', 'CA', 41),
  ('ho-chi-minh-city', 'city', 'Ho Chi Minh City', 'VN', 1),
  ('hanoi', 'city', 'Hanoi', 'VN', 2),
  ('da-nang', 'city', 'Da Nang', 'VN', 3),
  ('hai-phong', 'city', 'Hai Phong', 'VN', 4),
  ('can-tho', 'city', 'Can Tho', 'VN', 5),
  ('singapore-city', 'city', 'Singapore', 'SG', 10),
  ('bangkok', 'city', 'Bangkok', 'TH', 20),
  ('chiang-mai', 'city', 'Chiang Mai', 'TH', 21),
  ('kuala-lumpur', 'city', 'Kuala Lumpur', 'MY', 30),
  ('penang', 'city', 'Penang', 'MY', 31),
  ('jakarta', 'city', 'Jakarta', 'ID', 40),
  ('bali', 'city', 'Bali', 'ID', 41),
  ('manila', 'city', 'Manila', 'PH', 50),
  ('cebu', 'city', 'Cebu', 'PH', 51),
  ('phnom-penh', 'city', 'Phnom Penh', 'KH', 60),
  ('hong-kong-city', 'city', 'Hong Kong', 'HK', 70),
  ('taipei', 'city', 'Taipei', 'TW', 71),
  ('tokyo', 'city', 'Tokyo', 'JP', 72),
  ('seoul', 'city', 'Seoul', 'KR', 73),
  ('bengaluru', 'city', 'Bengaluru', 'IN', 74),
  ('sydney', 'city', 'Sydney', 'AU', 75),
  ('melbourne', 'city', 'Melbourne', 'AU', 76),
  ('dubai', 'city', 'Dubai', 'AE', 77),
  ('london', 'city', 'London', 'GB', 80);

-- ---------- Roles: each belongs to one of the job categories ----------

create table public.roles (
  slug text primary key check (slug ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  category text not null check (category in ('marketing', 'sales', 'customer_success', 'other')),
  name text not null,
  sort int not null default 100
);

insert into public.roles (slug, category, name, sort) values
  ('seo', 'marketing', 'SEO', 1),
  ('content', 'marketing', 'Content', 2),
  ('performance', 'marketing', 'Performance and paid', 3),
  ('social', 'marketing', 'Social media', 4),
  ('brand', 'marketing', 'Brand and communications', 5),
  ('product_marketing', 'marketing', 'Product marketing', 6),
  ('growth', 'marketing', 'Growth', 7),
  ('lifecycle', 'marketing', 'Email and lifecycle', 8),
  ('marketing_ops', 'marketing', 'Marketing operations', 9),
  ('marketing_lead', 'marketing', 'Marketing leadership', 10),
  ('sdr', 'sales', 'Sales development', 20),
  ('account_executive', 'sales', 'Account executive', 21),
  ('account_manager', 'sales', 'Account management', 22),
  ('partnerships', 'sales', 'Partnerships', 23),
  ('sales_ops', 'sales', 'Sales operations', 24),
  ('sales_lead', 'sales', 'Sales leadership', 25),
  ('cs_manager', 'customer_success', 'Customer success manager', 30),
  ('onboarding', 'customer_success', 'Onboarding and implementation', 31),
  ('support', 'customer_success', 'Customer support', 32),
  ('cs_ops', 'customer_success', 'Customer success operations', 33),
  ('cs_lead', 'customer_success', 'Customer success leadership', 34);

-- Lists are public: anyone can read them, only migrations change them.
alter table public.places enable row level security;
alter table public.roles enable row level security;
create policy places_read on public.places for select using (true);
create policy roles_read on public.roles for select using (true);

-- Checks a list of city slugs and a list of country codes against places.
create or replace function public.check_places(p_cities text[], p_countries text[]) returns void
language plpgsql stable set search_path = public as $$
declare bad text;
begin
  select c into bad from unnest(coalesce(p_cities, '{}')) c
    where not exists (select 1 from places where slug = c and kind = 'city') limit 1;
  if bad is not null then raise exception 'Unknown city: %', bad; end if;
  select c into bad from unnest(coalesce(p_countries, '{}')) c
    where not exists (select 1 from places where country_code = c and kind = 'country') limit 1;
  if bad is not null then raise exception 'Unknown country: %', bad; end if;
end $$;

-- ---------- Jobs: cities by slug, a role, a fixed currency list ----------

alter table public.jobs rename column office_locations to office_places;
alter table public.jobs add column role text references public.roles(slug);
alter table public.jobs add constraint jobs_currency_list
  check (salary_currency is null or salary_currency in ('VND', 'USD', 'SGD', 'THB', 'MYR', 'IDR', 'PHP'));
create index jobs_places on public.jobs using gin(office_places);
create index jobs_countries on public.jobs using gin(eligible_countries);

create or replace function public.check_job_lists() returns trigger
language plpgsql set search_path = public as $$
begin
  perform check_places(new.office_places, new.eligible_countries);
  -- A role decides the category, so the two never disagree.
  if new.role is not null then
    select category into new.category from roles where slug = new.role;
  end if;
  return new;
end $$;
create trigger jobs_lists before insert or update on public.jobs
  for each row execute function public.check_job_lists();

-- ---------- Companies: cities, size, industry, old addresses ----------

alter table public.orgs rename column locations to office_places;
alter table public.orgs add column size text check (size in ('1-10', '11-50', '51-200', '201-1000', '1000+'));
alter table public.orgs add column industry text check (length(industry) <= 80);
revoke update on public.orgs from authenticated;
grant update (name, slug, website, logo_url, about, office_places, size, industry) on public.orgs to authenticated;

create or replace function public.check_org_lists() returns trigger
language plpgsql set search_path = public as $$
begin
  perform check_places(new.office_places, null);
  return new;
end $$;
create trigger orgs_lists before insert or update on public.orgs
  for each row execute function public.check_org_lists();

-- When a company changes its address on Ocelot, the old one keeps working (search results, shared links).
create table public.org_slug_history (
  slug text primary key,
  org_id uuid not null references public.orgs(id) on delete cascade,
  changed_at timestamptz not null default now()
);
alter table public.org_slug_history enable row level security;
create policy org_slug_history_read on public.org_slug_history for select using (true);

create or replace function public.keep_old_slug() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.slug <> old.slug then
    if exists (select 1 from org_slug_history where slug = new.slug and org_id <> new.id) then
      raise exception 'That address was used by another company';
    end if;
    delete from org_slug_history where slug = new.slug;
    insert into org_slug_history (slug, org_id) values (old.slug, old.id) on conflict (slug) do nothing;
  end if;
  return new;
end $$;
create trigger orgs_slug_history before update on public.orgs
  for each row execute function public.keep_old_slug();

-- ---------- The candidate profile (copied into applications in Milestone 4) ----------

alter table public.profiles
  add column intent text check (intent in ('candidate', 'employer')),
  add column city text references public.places(slug),
  add column country_code text,
  add column years_experience int check (years_experience between 0 and 60),
  add column work_countries text[] not null default '{}',
  add column languages text[] not null default '{}',
  add column open_to text[] not null default '{}',
  add column salary_hope_min numeric check (salary_hope_min >= 0),
  add column salary_hope_currency text
    check (salary_hope_currency is null or salary_hope_currency in ('VND', 'USD', 'SGD', 'THB', 'MYR', 'IDR', 'PHP')),
  add column salary_hope_period text check (salary_hope_period in ('hour', 'month', 'year')),
  add column time_zone text not null default 'Asia/Ho_Chi_Minh',
  add constraint profiles_open_to check (open_to <@ array['on_site', 'hybrid', 'remote']),
  add constraint profiles_languages check (array_to_string(languages, ',') ~ '^([a-z]{2,3}(,[a-z]{2,3})*)?$');

alter table public.profiles drop column location;

create or replace function public.check_profile_lists() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  perform check_places(null, new.work_countries || case when new.country_code is null then '{}'::text[] else array[new.country_code] end);
  if new.city is not null and new.country_code is null then
    select country_code into new.country_code from places where slug = new.city;
  end if;
  return new;
end $$;
create trigger profiles_lists before insert or update on public.profiles
  for each row execute function public.check_profile_lists();

-- People choose what they share; email and id are set by sign-in only.
revoke update on public.profiles from authenticated;
grant update (full_name, headline, phone, links, preferences, intent, city, country_code, years_experience,
  work_countries, languages, open_to, salary_hope_min, salary_hope_currency, salary_hope_period, time_zone)
  on public.profiles to authenticated;

-- ---------- Applications outlive a deleted candidate, without their details ----------

alter table public.applications drop constraint applications_candidate_id_fkey;
alter table public.applications alter column candidate_id drop not null;
alter table public.applications add constraint applications_candidate_id_fkey
  foreign key (candidate_id) references auth.users(id) on delete set null;
alter table public.applications add column candidate_deleted_at timestamptz;
alter table public.applications add column snapshot_version int not null default 1;

-- When the candidate's account goes, the company keeps the stage history and loses who it was.
create or replace function public.anonymize_application() returns trigger
language plpgsql as $$
begin
  if old.candidate_id is not null and new.candidate_id is null then
    new.snapshot := jsonb_build_object('deleted', true);
    new.resume_id := null;
    new.candidate_deleted_at := now();
  end if;
  return new;
end $$;
create trigger applications_anonymize before update on public.applications
  for each row execute function public.anonymize_application();

-- ---------- Email: choices and a send log ----------

create table public.notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  application_updates boolean not null default true,
  job_alerts boolean not null default true,
  weekly_digest boolean not null default false,
  product_news boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
create policy notification_prefs_own on public.notification_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Server only: helps answer "I never got the email".
create table public.email_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  to_email text not null,
  kind text not null,
  resend_id text,
  status text not null default 'sent' check (status in ('sent', 'failed', 'skipped')),
  error text,
  created_at timestamptz not null default now()
);
create index email_log_to on public.email_log(to_email, created_at desc);
alter table public.email_log enable row level security;
