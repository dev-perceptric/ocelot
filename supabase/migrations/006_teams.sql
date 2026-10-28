-- Milestone 1, part C: invites, roles and the "Email verified" label.
-- People join a company only by accepting an invite sent to their own email.

-- ---------- Roles ----------
-- Owner: everything. Admin: settings, members, jobs; can't touch owners. Member: jobs and applicants.

drop policy org_members_insert on public.org_members; -- joining is only through accept_invite / create_org
drop policy org_members_update on public.org_members;
drop policy org_members_delete on public.org_members;

create policy org_members_update on public.org_members for update
  using (public.is_org_member(org_id, array['owner']) or (public.is_org_member(org_id, array['admin']) and role <> 'owner'))
  with check (public.is_org_member(org_id, array['owner']) or (public.is_org_member(org_id, array['admin']) and role <> 'owner'));
create policy org_members_delete on public.org_members for delete
  using (user_id = auth.uid()
    or public.is_org_member(org_id, array['owner'])
    or (public.is_org_member(org_id, array['admin']) and role <> 'owner'));
revoke update on public.org_members from anon, authenticated;
grant update (role) on public.org_members to authenticated;

-- A company always keeps an owner. Deleting the whole company (or the last person in it) is the exception.
create or replace function public.keep_an_owner() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_org uuid := old.org_id;
begin
  if old.role <> 'owner' then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and new.role = 'owner' then return new; end if;
  if not exists (select 1 from orgs where id = v_org) then return coalesce(new, old); end if;
  if tg_op = 'DELETE' and not exists (select 1 from org_members where org_id = v_org and user_id <> old.user_id) then
    return old;
  end if;
  if not exists (select 1 from org_members where org_id = v_org and role = 'owner' and user_id <> old.user_id) then
    raise exception 'A company needs an owner. Make someone else an owner first.';
  end if;
  return coalesce(new, old);
end $$;
create trigger org_members_keep_owner before update or delete on public.org_members
  for each row execute function public.keep_an_owner();

-- ---------- Invites ----------

create table public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  email text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  role text not null default 'member' check (role in ('admin', 'member')),
  token_hash text not null unique, -- sha256 of the link token; the token itself is only in the email
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index org_invites_org on public.org_invites(org_id, created_at desc);
alter table public.org_invites enable row level security;
create policy org_invites_select on public.org_invites for select
  using (public.is_org_member(org_id, array['owner', 'admin']));
-- No insert, update or delete for people: the functions below do it with their checks.

create or replace function public.my_email() returns text
language sql stable security definer set search_path = public, auth as $$
  select lower(email) from auth.users where id = auth.uid()
$$;

-- Returns the link token once. Limits: 20 open invites per company, 50 sent per company per day.
create or replace function public.create_invite(p_org uuid, p_email text, p_role text default 'member') returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_email text := lower(trim(p_email)); v_token text;
begin
  if not is_org_member(p_org, array['owner', 'admin']) then raise exception 'Only owners and admins can invite people'; end if;
  if p_role not in ('admin', 'member') then raise exception 'Invite people as an admin or a member'; end if;
  if exists (select 1 from org_members m join auth.users u on u.id = m.user_id where m.org_id = p_org and lower(u.email) = v_email) then
    raise exception 'This person is already on the team';
  end if;
  if (select count(*) from org_invites where org_id = p_org and created_at > now() - interval '1 day') >= 50 then
    raise exception 'Too many invites today. Try again tomorrow.';
  end if;
  -- A new invite to the same email replaces the old one.
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
    where id = p_id and accepted_at is null and revoked_at is null and is_org_member(org_id, array['owner', 'admin']);
  if not found then raise exception 'Invite not found'; end if;
end $$;

-- What the invite page shows before accepting. Only someone holding the token can ask.
create or replace function public.invite_preview(p_token text)
returns table (company text, company_slug text, role text, email text, inviter text, status text)
language sql stable security definer set search_path = public, extensions as $$
  select o.name, o.slug, i.role, i.email, coalesce(p.full_name, 'A teammate'),
    case when i.accepted_at is not null then 'accepted'
         when i.revoked_at is not null then 'revoked'
         when i.expires_at <= now() then 'expired'
         else 'open' end
  from org_invites i
  join orgs o on o.id = i.org_id
  left join profiles p on p.id = i.invited_by
  where i.token_hash = encode(digest(p_token, 'sha256'), 'hex')
$$;

-- Joins the company. The signed-in email must be the invited one, and the link works once.
create or replace function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare i org_invites%rowtype;
begin
  select * into i from org_invites where token_hash = encode(digest(p_token, 'sha256'), 'hex') for update;
  if i.id is null then raise exception 'This invite link isn''t valid'; end if;
  if i.accepted_at is not null then raise exception 'This invite was already used'; end if;
  if i.revoked_at is not null then raise exception 'This invite was cancelled'; end if;
  if i.expires_at <= now() then raise exception 'This invite has expired. Ask for a new one.'; end if;
  if my_email() is distinct from i.email then raise exception 'Sign in as % to accept this invite', i.email; end if;
  insert into org_members (org_id, user_id, role) values (i.org_id, auth.uid(), i.role) on conflict (org_id, user_id) do nothing;
  update org_invites set accepted_at = now(), accepted_by = auth.uid() where id = i.id;
  return i.org_id;
end $$;

-- ---------- "Email verified": a member signs in with an email on the company's own domain ----------

create or replace function public.website_domain(p_url text) returns text
language sql immutable as $$
  select nullif(regexp_replace(lower(coalesce(p_url, '')), '^(https?://)?(www\.)?([^/:?#]+).*$', '\3'), '')
$$;

create or replace function public.is_free_email_domain(p_domain text) returns boolean
language sql immutable as $$
  select p_domain = any (array['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.com.vn', 'outlook.com', 'hotmail.com',
    'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com',
    'mail.com', 'yandex.com', 'zoho.com', 'qq.com', '163.com', 'naver.com'])
$$;

-- Sets or clears the label from the current members and website. Never set by hand.
create or replace function public.refresh_email_verified(p_org uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
declare d text;
begin
  select website_domain(website) into d from orgs where id = p_org;
  if d is null or is_free_email_domain(d) or not exists (
    select 1 from org_members m join auth.users u on u.id = m.user_id
    where m.org_id = p_org and lower(split_part(u.email, '@', 2)) in (d, 'www.' || d)
  ) then d := null; end if;
  update orgs set email_verified_domain = d where id = p_org and email_verified_domain is distinct from d;
end $$;
revoke execute on function public.refresh_email_verified(uuid) from public, anon, authenticated;

create or replace function public.on_member_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from orgs where id = coalesce(new.org_id, old.org_id)) then
    perform refresh_email_verified(coalesce(new.org_id, old.org_id));
  end if;
  return null;
end $$;
create trigger org_members_email_verified after insert or delete on public.org_members
  for each row execute function public.on_member_change();

create or replace function public.on_website_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.website is distinct from old.website then perform refresh_email_verified(new.id); end if;
  return null;
end $$;
create trigger orgs_email_verified after update of website on public.orgs
  for each row execute function public.on_website_change();

-- Teammates see each other's name and email; profiles stay private otherwise.
create or replace function public.team_members(p_org uuid)
returns table (user_id uuid, role text, full_name text, email text, joined_at timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select m.user_id, m.role, p.full_name, u.email, m.created_at
  from org_members m
  join auth.users u on u.id = m.user_id
  left join profiles p on p.id = m.user_id
  where m.org_id = p_org and is_org_member(p_org)
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.created_at
$$;
