-- Milestone 7, step 1: agencies (docs/m7-agencies.md).
-- A recruiting agency runs hiring for many client companies. Its staff reach every client's jobs and
-- applicants through is_org_member, so every access rule that already uses it works for agencies as is.
-- Agency staff never manage a client's own team and never become a client's owner.

-- ---------- Tables ----------

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  website text,
  logo_url text,
  about text,
  business_verified_at timestamptz,   -- "Agency verified": an admin checked the business
  business_verified_note text,
  suspended_at timestamptz,
  suspended_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.agency_members (
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'recruiter' check (role in ('owner', 'admin', 'recruiter')),
  created_at timestamptz not null default now(),
  primary key (agency_id, user_id)
);
create index agency_members_user on public.agency_members(user_id);
alter table public.agency_members add constraint agency_members_profile_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.orgs add column agency_id uuid references public.agencies(id) on delete set null;
alter table public.orgs add column suspended_by_agency boolean not null default false; -- set and cleared with the agency
create index orgs_agency on public.orgs(agency_id) where agency_id is not null;

create table public.agency_invites (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  email text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  role text not null default 'recruiter' check (role in ('admin', 'recruiter')),
  token_hash text not null unique, -- sha256 of the link token; the token itself is only in the email
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index agency_invites_agency on public.agency_invites(agency_id, created_at desc);

-- An agency asks to manage a company that has its own team. Only that company's owner can say yes.
create table public.agency_client_requests (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  agency_name text not null,  -- names at the time of the request, so each side can read them
  org_name text not null,
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  accepted boolean,
  answered_by uuid references auth.users(id) on delete set null,
  check ((answered_at is null) = (accepted is null))
);
create unique index agency_client_requests_open on public.agency_client_requests(agency_id, org_id) where answered_at is null;
create index agency_client_requests_org on public.agency_client_requests(org_id, created_at desc);

-- ---------- Who is who ----------

create or replace function public.is_agency_member(p_agency uuid, p_roles text[] default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from agency_members
    where agency_id = p_agency and user_id = auth.uid() and (p_roles is null or role = any(p_roles))
  )
$$;

-- Someone on the company's own team. Team management (roles, removals, invites) uses this one.
create or replace function public.is_direct_org_member(p_org uuid, p_roles text[] default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_members
    where org_id = p_org and user_id = auth.uid() and (p_roles is null or role = any(p_roles))
  )
$$;

-- The company's own team, or staff of the agency that manages it. Agency owners and admins count as company
-- admins, recruiters as company members. Nobody counts as a company owner through an agency.
create or replace function public.is_org_member(p_org uuid, p_roles text[] default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_members
    where org_id = p_org and user_id = auth.uid() and (p_roles is null or role = any(p_roles))
  ) or exists (
    select 1 from orgs o join agency_members a on a.agency_id = o.agency_id
    where o.id = p_org and a.user_id = auth.uid()
      and (p_roles is null or (case a.role when 'recruiter' then 'member' else 'admin' end) = any(p_roles))
  )
$$;

-- Team management stays with the company's own team.
drop policy org_members_update on public.org_members;
drop policy org_members_delete on public.org_members;
create policy org_members_update on public.org_members for update
  using (public.is_direct_org_member(org_id, array['owner']) or (public.is_direct_org_member(org_id, array['admin']) and role <> 'owner'))
  with check (public.is_direct_org_member(org_id, array['owner']) or (public.is_direct_org_member(org_id, array['admin']) and role <> 'owner'));
create policy org_members_delete on public.org_members for delete
  using (user_id = auth.uid()
    or public.is_direct_org_member(org_id, array['owner'])
    or (public.is_direct_org_member(org_id, array['admin']) and role <> 'owner'));

drop policy org_invites_select on public.org_invites;
create policy org_invites_select on public.org_invites for select
  using (public.is_direct_org_member(org_id, array['owner', 'admin']));

create or replace function public.create_invite(p_org uuid, p_email text, p_role text default 'member') returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_email text := lower(trim(p_email)); v_token text;
begin
  if not is_direct_org_member(p_org, array['owner', 'admin']) then raise exception 'Only owners and admins can invite people'; end if;
  if p_role not in ('admin', 'member') then raise exception 'Invite people as an admin or a member'; end if;
  if exists (select 1 from org_members m join auth.users u on u.id = m.user_id where m.org_id = p_org and lower(u.email) = v_email) then
    raise exception 'This person is already on the team';
  end if;
  if (select count(*) from org_invites where org_id = p_org and created_at > now() - interval '1 day') >= 50 then
    raise exception 'Too many invites today. Try again tomorrow.';
  end if;
  update org_invites set revoked_at = now()
    where org_id = p_org and email = v_email and accepted_at is null and revoked_at is null;
  if (select count(*) from org_invites where org_id = p_org and accepted_at is null and revoked_at is null and expires_at > now()) >= 20 then
    raise exception 'This company has 20 open invites. Cancel some first.';
  end if;
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into org_invites (org_id, email, role, token_hash, invited_by)
    values (p_org, v_email, p_role, encode(digest(v_token, 'sha256'), 'hex'), auth.uid());
  return v_token;
end $$;

create or replace function public.revoke_invite(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update org_invites set revoked_at = now()
    where id = p_id and accepted_at is null and revoked_at is null and is_direct_org_member(org_id, array['owner', 'admin']);
  if not found then raise exception 'Invite not found'; end if;
end $$;

-- ---------- Row level security ----------

alter table public.agencies enable row level security;
alter table public.agency_members enable row level security;
alter table public.agency_invites enable row level security;
alter table public.agency_client_requests enable row level security;

-- An agency is public while a client has a public job page. Its staff and its clients' own teams always see it.
create policy agencies_select on public.agencies for select using (
  public.is_agency_member(id)
  or exists (select 1 from public.orgs o where o.agency_id = agencies.id and public.is_direct_org_member(o.id))
  or (suspended_at is null and exists (
    select 1 from public.orgs o join public.jobs j on j.org_id = o.id
    where o.agency_id = agencies.id and o.suspended_at is null
      and j.status in ('published', 'closed', 'expired') and j.published_at is not null))
);
create policy agencies_update on public.agencies for update
  using (public.is_agency_member(id, array['owner', 'admin']))
  with check (public.is_agency_member(id, array['owner', 'admin']));
-- Verification and suspension are set by Ocelot only.
revoke update on public.agencies from anon, authenticated;
grant update (name, slug, website, logo_url, about) on public.agencies to authenticated;

create policy agency_members_select on public.agency_members for select using (public.is_agency_member(agency_id));
create policy agency_members_update on public.agency_members for update
  using (public.is_agency_member(agency_id, array['owner']) or (public.is_agency_member(agency_id, array['admin']) and role <> 'owner'))
  with check (public.is_agency_member(agency_id, array['owner']) or (public.is_agency_member(agency_id, array['admin']) and role <> 'owner'));
create policy agency_members_delete on public.agency_members for delete
  using (user_id = auth.uid()
    or public.is_agency_member(agency_id, array['owner'])
    or (public.is_agency_member(agency_id, array['admin']) and role <> 'owner'));
revoke update on public.agency_members from anon, authenticated;
grant update (role) on public.agency_members to authenticated;
-- Joining is only through create_agency and accept_agency_invite.

create policy agency_invites_select on public.agency_invites for select
  using (public.is_agency_member(agency_id, array['owner', 'admin']));

create policy agency_client_requests_select on public.agency_client_requests for select
  using (public.is_agency_member(agency_id) or public.is_direct_org_member(org_id, array['owner', 'admin']));

-- ---------- An agency always keeps an owner ----------

create or replace function public.keep_an_agency_owner() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_agency uuid := old.agency_id;
begin
  if old.role <> 'owner' then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and new.role = 'owner' then return new; end if;
  if not exists (select 1 from agencies where id = v_agency) then return coalesce(new, old); end if;
  if tg_op = 'DELETE' and not exists (select 1 from agency_members where agency_id = v_agency and user_id <> old.user_id) then
    return old;
  end if;
  if not exists (select 1 from agency_members where agency_id = v_agency and role = 'owner' and user_id <> old.user_id) then
    raise exception 'An agency needs an owner. Make someone else an owner first.';
  end if;
  return coalesce(new, old);
end $$;
create trigger agency_members_keep_owner before update or delete on public.agency_members
  for each row execute function public.keep_an_agency_owner();

-- When the last person leaves, the agency goes too.
create or replace function public.drop_empty_agency() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from agency_members where agency_id = old.agency_id) then
    delete from agencies where id = old.agency_id;
  end if;
  return null;
end $$;
create trigger agency_members_drop_empty after delete on public.agency_members
  for each row execute function public.drop_empty_agency();

-- A deleted agency takes the clients it made with it (nobody else runs them). Companies with their own team
-- stay, without the agency, and lose any suspension that came from it.
create or replace function public.before_agency_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from orgs o where o.agency_id = old.id and not exists (select 1 from org_members m where m.org_id = o.id);
  update orgs set suspended_at = null, suspended_reason = null, suspended_by_agency = false
    where agency_id = old.id and suspended_by_agency;
  return old;
end $$;
create trigger agencies_before_delete before delete on public.agencies
  for each row execute function public.before_agency_delete();

-- ---------- Making an agency and its team ----------

create or replace function public.create_agency(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into agencies (name, slug, created_by) values (trim(p_name), p_slug, auth.uid()) returning id into v_id;
  insert into agency_members (agency_id, user_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end $$;

-- Returns the link token once. Limits: 20 open invites per agency, 50 sent per agency per day.
create or replace function public.create_agency_invite(p_agency uuid, p_email text, p_role text default 'recruiter') returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_email text := lower(trim(p_email)); v_token text;
begin
  if not is_agency_member(p_agency, array['owner', 'admin']) then raise exception 'Only owners and admins can invite people'; end if;
  if p_role not in ('admin', 'recruiter') then raise exception 'Invite people as an admin or a recruiter'; end if;
  if exists (select 1 from agency_members m join auth.users u on u.id = m.user_id where m.agency_id = p_agency and lower(u.email) = v_email) then
    raise exception 'This person is already on the team';
  end if;
  if (select count(*) from agency_invites where agency_id = p_agency and created_at > now() - interval '1 day') >= 50 then
    raise exception 'Too many invites today. Try again tomorrow.';
  end if;
  update agency_invites set revoked_at = now()
    where agency_id = p_agency and email = v_email and accepted_at is null and revoked_at is null;
  if (select count(*) from agency_invites where agency_id = p_agency and accepted_at is null and revoked_at is null and expires_at > now()) >= 20 then
    raise exception 'This agency has 20 open invites. Cancel some first.';
  end if;
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into agency_invites (agency_id, email, role, token_hash, invited_by)
    values (p_agency, v_email, p_role, encode(digest(v_token, 'sha256'), 'hex'), auth.uid());
  return v_token;
end $$;

create or replace function public.revoke_agency_invite(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update agency_invites set revoked_at = now()
    where id = p_id and accepted_at is null and revoked_at is null and is_agency_member(agency_id, array['owner', 'admin']);
  if not found then raise exception 'Invite not found'; end if;
end $$;

-- What the invite page shows before accepting. Only someone holding the token can ask.
create or replace function public.agency_invite_preview(p_token text)
returns table (agency text, agency_slug text, role text, email text, inviter text, status text)
language sql stable security definer set search_path = public, extensions as $$
  select a.name, a.slug, i.role, i.email, coalesce(p.full_name, 'A teammate'),
    case when i.accepted_at is not null then 'accepted'
         when i.revoked_at is not null then 'revoked'
         when i.expires_at <= now() then 'expired'
         else 'open' end
  from agency_invites i
  join agencies a on a.id = i.agency_id
  left join profiles p on p.id = i.invited_by
  where i.token_hash = encode(digest(p_token, 'sha256'), 'hex')
$$;

-- Joins the agency. The signed-in email must be the invited one, and the link works once.
create or replace function public.accept_agency_invite(p_token text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare i agency_invites%rowtype;
begin
  select * into i from agency_invites where token_hash = encode(digest(p_token, 'sha256'), 'hex') for update;
  if i.id is null then raise exception 'This invite link isn''t valid'; end if;
  if i.accepted_at is not null then raise exception 'This invite was already used'; end if;
  if i.revoked_at is not null then raise exception 'This invite was cancelled'; end if;
  if i.expires_at <= now() then raise exception 'This invite has expired. Ask for a new one.'; end if;
  if my_email() is distinct from i.email then raise exception 'Sign in as % to accept this invite', i.email; end if;
  insert into agency_members (agency_id, user_id, role) values (i.agency_id, auth.uid(), i.role) on conflict (agency_id, user_id) do nothing;
  update agency_invites set accepted_at = now(), accepted_by = auth.uid() where id = i.id;
  return i.agency_id;
end $$;

-- Staff see each other's name and email; profiles stay private otherwise.
create or replace function public.agency_team(p_agency uuid)
returns table (user_id uuid, role text, full_name text, email text, joined_at timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select m.user_id, m.role, p.full_name, u.email, m.created_at
  from agency_members m
  join auth.users u on u.id = m.user_id
  left join profiles p on p.id = m.user_id
  where m.agency_id = p_agency and is_agency_member(p_agency)
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.created_at
$$;

-- ---------- Clients ----------

create or replace function public.agency_open(p_agency uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from agencies where id = p_agency and suspended_at is not null) then
    raise exception 'This agency is suspended. Contact Ocelot.';
  end if;
end $$;

-- A new client the agency runs. It has no team of its own.
create or replace function public.create_agency_client(p_agency uuid, p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_agency_member(p_agency, array['owner', 'admin']) then raise exception 'Only agency owners and admins can add clients'; end if;
  perform agency_open(p_agency);
  insert into orgs (name, slug, created_by, agency_id) values (trim(p_name), p_slug, auth.uid(), p_agency) returning id into v_id;
  return v_id;
end $$;

-- Asks to manage a company that already has its own team. Companies with no team (such as imported ones)
-- can't be asked: there's nobody to say yes.
create or replace function public.request_agency_client(p_agency uuid, p_org_slug text) returns uuid
language plpgsql security definer set search_path = public as $$
declare o orgs%rowtype; v_id uuid;
begin
  if not is_agency_member(p_agency, array['owner', 'admin']) then raise exception 'Only agency owners and admins can add clients'; end if;
  perform agency_open(p_agency);
  select * into o from orgs where slug = lower(trim(p_org_slug));
  if o.id is null or not exists (select 1 from org_members where org_id = o.id and role = 'owner') then
    raise exception 'No company with its own team has that address';
  end if;
  if o.agency_id = p_agency then raise exception 'This company is already your client'; end if;
  if o.agency_id is not null then raise exception 'This company already works with an agency'; end if;
  if exists (select 1 from agency_client_requests where agency_id = p_agency and org_id = o.id and answered_at is null) then
    raise exception 'You already asked this company. Wait for its answer.';
  end if;
  if (select count(*) from agency_client_requests where agency_id = p_agency and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many requests today. Try again tomorrow.';
  end if;
  insert into agency_client_requests (agency_id, org_id, agency_name, org_name, requested_by)
    select p_agency, o.id, a.name, o.name, auth.uid() from agencies a where a.id = p_agency
    returning id into v_id;
  return v_id;
end $$;

-- The company's owner answers. Yes hands the company's jobs and applicants to the agency's staff.
create or replace function public.answer_agency_client_request(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r agency_client_requests%rowtype;
begin
  select * into r from agency_client_requests where id = p_id for update;
  if r.id is null or not is_direct_org_member(r.org_id, array['owner']) then raise exception 'Request not found'; end if;
  if r.answered_at is not null then raise exception 'This request was already answered'; end if;
  if p_accept then
    perform agency_open(r.agency_id);
    update orgs set agency_id = r.agency_id where id = r.org_id and agency_id is null;
    if not found then raise exception 'This company already works with an agency'; end if;
    -- Other agencies' open requests close with a no.
    update agency_client_requests set answered_at = now(), accepted = false, answered_by = auth.uid()
      where org_id = r.org_id and answered_at is null and id <> r.id;
  end if;
  update agency_client_requests set answered_at = now(), accepted = coalesce(p_accept, false), answered_by = auth.uid()
    where id = r.id;
end $$;

-- Ends the arrangement with a company that has its own team, at once. Its owner can, and so can the agency's
-- owners and admins. A client with no team of its own is deleted instead (delete_agency_client).
create or replace function public.remove_agency_client(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o orgs%rowtype;
begin
  select * into o from orgs where id = p_org for update;
  if o.id is null or o.agency_id is null
     or not (is_direct_org_member(p_org, array['owner']) or is_agency_member(o.agency_id, array['owner', 'admin'])) then
    raise exception 'Client not found';
  end if;
  if not exists (select 1 from org_members where org_id = p_org) then
    raise exception 'This client has no team of its own. Delete it instead.';
  end if;
  update orgs set agency_id = null,
    suspended_at = case when suspended_by_agency then null else suspended_at end,
    suspended_reason = case when suspended_by_agency then null else suspended_reason end,
    suspended_by_agency = false
  where id = p_org;
end $$;

-- Deletes a client the agency runs alone, with its jobs and applications. Agency owners only.
create or replace function public.delete_agency_client(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o orgs%rowtype;
begin
  select * into o from orgs where id = p_org for update;
  if o.id is null or o.agency_id is null or not is_agency_member(o.agency_id, array['owner']) then
    raise exception 'Client not found';
  end if;
  if exists (select 1 from org_members where org_id = p_org) then
    raise exception 'This company has its own team. Remove it from your clients instead.';
  end if;
  delete from orgs where id = p_org;
end $$;

-- Logos: <org id>/<file> for companies, agencies/<agency id>/<file> for agencies.
create or replace function public.can_write_logo(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare f text[] := string_to_array(p_name, '/');
begin
  if f[1] = 'agencies' then return is_agency_member(f[2]::uuid, array['owner', 'admin']); end if;
  return is_org_member(f[1]::uuid, array['owner', 'admin']);
exception when invalid_text_representation then return false;
end $$;

do $$
begin
  if to_regclass('storage.objects') is null then return; end if;
  execute 'drop policy if exists logos_write on storage.objects';
  execute 'drop policy if exists logos_delete on storage.objects';
  execute $p$create policy logos_write on storage.objects for insert to authenticated
    with check (bucket_id = 'logos' and public.can_write_logo(name))$p$;
  execute $p$create policy logos_delete on storage.objects for delete to authenticated
    using (bucket_id = 'logos' and public.can_write_logo(name))$p$;
end $$;

-- ---------- Ocelot only: suspending an agency ----------
-- Suspending an agency suspends every client with it, so every public list that hides suspended companies
-- hides them too. Lifting it clears only the suspensions that came from the agency.

create or replace function public.suspend_agency(p_agency uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Say why'; end if;
  update agencies set suspended_at = now(), suspended_reason = trim(p_reason) where id = p_agency and suspended_at is null;
  if not found then raise exception 'Agency not found, or already suspended'; end if;
  update orgs set suspended_at = now(), suspended_reason = 'Agency suspended: ' || trim(p_reason), suspended_by_agency = true
    where agency_id = p_agency and suspended_at is null;
end $$;

create or replace function public.unsuspend_agency(p_agency uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update agencies set suspended_at = null, suspended_reason = null where id = p_agency;
  update orgs set suspended_at = null, suspended_reason = null, suspended_by_agency = false
    where agency_id = p_agency and suspended_by_agency;
end $$;

revoke execute on function public.suspend_agency(uuid, text), public.unsuspend_agency(uuid) from public, anon, authenticated;
revoke execute on function public.create_agency(text, text), public.create_agency_invite(uuid, text, text),
  public.revoke_agency_invite(uuid), public.accept_agency_invite(text), public.agency_team(uuid),
  public.create_agency_client(uuid, text, text), public.request_agency_client(uuid, text),
  public.answer_agency_client_request(uuid, boolean), public.remove_agency_client(uuid),
  public.delete_agency_client(uuid) from public, anon;
grant execute on function public.create_agency(text, text), public.create_agency_invite(uuid, text, text),
  public.revoke_agency_invite(uuid), public.accept_agency_invite(text), public.agency_team(uuid),
  public.create_agency_client(uuid, text, text), public.request_agency_client(uuid, text),
  public.answer_agency_client_request(uuid, boolean), public.remove_agency_client(uuid),
  public.delete_agency_client(uuid) to authenticated;
