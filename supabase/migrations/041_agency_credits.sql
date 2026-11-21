-- Milestone 7, step 4: an agency buys listing credits once and spends them on any of its clients
-- (docs/m7-agencies.md). An order and a credit belong to a company or to an agency.
--
-- Which credit a job uses: the company's own first (founding, then standard, then featured, oldest first, as
-- before), then its agency's. Agency credits are spent only by the agency's staff (or the server), so a company's
-- own team never uses up its agency's credits.

-- ---------- Orders ----------
alter table public.orders add column agency_id uuid references public.agencies(id) on delete set null;
alter table public.orders add column agency_name text; -- kept like org_name: orders are financial records
alter table public.orders add constraint orders_one_owner check (org_id is null or agency_id is null);
create index orders_agency on public.orders(agency_id, created_at desc) where agency_id is not null;

create or replace function public.order_org_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.org_id is not null then select name into new.org_name from orgs where id = new.org_id; end if;
  if new.agency_id is not null then select name into new.agency_name from agencies where id = new.agency_id; end if;
  return new;
end $$;

drop policy orders_select on public.orders;
create policy orders_select on public.orders for select
  using (public.is_org_member(org_id) or public.is_agency_member(agency_id));

-- ---------- Credits ----------
alter table public.entitlements alter column org_id drop not null;
alter table public.entitlements add column agency_id uuid references public.agencies(id) on delete cascade;
alter table public.entitlements add constraint entitlements_one_owner check ((org_id is null) <> (agency_id is null));
create index entitlements_agency_free on public.entitlements(agency_id, created_at) where job_id is null and agency_id is not null;

drop policy entitlements_select on public.entitlements;
create policy entitlements_select on public.entitlements for select
  using (public.is_org_member(org_id) or public.is_agency_member(agency_id)
    -- the company's team sees which listing its own jobs use, whoever paid for it
    or exists (select 1 from public.jobs j where j.id = job_id and public.is_org_member(j.org_id)));

-- A deleted agency's unused credits go with it. A credit already on a job of a company with its own team stays on
-- that job, now the company's. Clients the agency ran alone are deleted with it, and so are their jobs and credits.
create or replace function public.before_agency_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update entitlements e set org_id = j.org_id, agency_id = null
    from jobs j where e.agency_id = old.id and e.job_id = j.id
      and exists (select 1 from org_members m where m.org_id = j.org_id);
  delete from orgs o where o.agency_id = old.id and not exists (select 1 from org_members m where m.org_id = o.id);
  update orgs set suspended_at = null, suspended_reason = null, suspended_by_agency = false
    where agency_id = old.id and suspended_by_agency;
  return old;
end $$;

-- Puts a credit on a job: one of the company's, else one of its agency's (agency staff and the server only).
-- A job keeps the credit it has; asking again returns its package.
create or replace function public.attach_credit(p_job uuid, p_package text default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_job jobs%rowtype; v_agency uuid; v_ent uuid; v_pkg text;
begin
  select * into v_job from jobs where id = p_job;
  if not found or (auth.uid() is not null and not is_org_member(v_job.org_id)) then raise exception 'Job not found'; end if;
  select package into v_pkg from entitlements where job_id = p_job;
  if v_pkg is not null then return v_pkg; end if;
  select id, package into v_ent, v_pkg from entitlements
    where org_id = v_job.org_id and job_id is null
      and (p_package is null or package = p_package or (p_package = 'standard' and package = 'founding'))
    order by case package when 'founding' then 0 when 'standard' then 1 else 2 end, created_at
    limit 1 for update skip locked;
  if v_ent is null then
    select agency_id into v_agency from orgs where id = v_job.org_id;
    if v_agency is not null and (auth.uid() is null or is_agency_member(v_agency)) then
      select id, package into v_ent, v_pkg from entitlements
        where agency_id = v_agency and job_id is null
          and (p_package is null or package = p_package or (p_package = 'standard' and package = 'founding'))
        order by case package when 'founding' then 0 when 'standard' then 1 else 2 end, created_at
        limit 1 for update skip locked;
    end if;
  end if;
  if v_ent is null then raise exception 'No listing credit left. Buy one to send this job for review.'; end if;
  update entitlements set job_id = p_job, used_at = now() where id = v_ent;
  return v_pkg;
end $$;
revoke execute on function public.attach_credit(uuid, text) from public, anon;
grant execute on function public.attach_credit(uuid, text) to authenticated;

-- The Stripe webhook, as in 017_credits.sql, for company and agency orders. An agency order for a job attaches
-- its credit only to a job of one of that agency's clients.
create or replace function public.record_payment(p_event text, p_type text, p_order uuid, p_session text, p_amount int,
  p_currency text, p_payment_intent text) returns text
language plpgsql security definer set search_path = public as $$
declare v_order orders%rowtype; v_job jobs%rowtype; v_ent uuid;
begin
  insert into stripe_events (id, type) values (p_event, p_type) on conflict (id) do nothing;
  if not found then return 'repeat'; end if;
  select * into v_order from orders where id = p_order for update;
  if not found or v_order.stripe_session_id is distinct from p_session then return 'no order'; end if;
  if v_order.status <> 'pending' then return 'already ' || v_order.status; end if;
  if v_order.amount_cents <> p_amount or lower(v_order.currency) <> lower(p_currency) then
    update orders set status = 'failed' where id = p_order;
    return 'amount mismatch';
  end if;
  if v_order.org_id is null and v_order.agency_id is null then
    update orders set status = 'failed' where id = p_order;
    return 'no owner';
  end if;
  update orders set status = 'paid', paid_at = now(), stripe_payment_intent = p_payment_intent where id = p_order;
  insert into entitlements (org_id, agency_id, order_id, package)
    values (v_order.org_id, v_order.agency_id, v_order.id, v_order.package) returning id into v_ent;

  if v_order.job_id is null then return 'credit added'; end if;
  select * into v_job from jobs where id = v_order.job_id for update;
  if not found or exists (select 1 from entitlements where job_id = v_job.id)
     or (v_order.org_id is not null and v_job.org_id <> v_order.org_id)
     or (v_order.agency_id is not null and not exists (select 1 from orgs where id = v_job.org_id and agency_id = v_order.agency_id)) then
    return 'credit added';
  end if;
  update entitlements set job_id = v_job.id, used_at = now() where id = v_ent;
  if v_job.status in ('draft', 'rejected') and job_missing(v_job) is null and not org_suspended(v_job.org_id) then
    if org_trusted(v_job.org_id) then
      update jobs set status = 'published', review_note = null, published_at = now(), expires_at = now() + interval '30 days' where id = v_job.id;
    else
      update jobs set status = 'pending_review', review_note = null where id = v_job.id;
    end if;
    return 'sent';
  end if;
  return 'credit attached';
end $$;

-- Founding credits for an agency, from /admin (step 5 adds the button).
create or replace function public.grant_agency_credits(p_agency uuid, p_count int, p_admin uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_count not between 1 and 50 then raise exception 'Give between 1 and 50 credits'; end if;
  insert into entitlements (agency_id, package, granted_by) select p_agency, 'founding', p_admin from generate_series(1, p_count);
end $$;

revoke execute on function public.record_payment(text, text, uuid, text, int, text, text),
  public.grant_agency_credits(uuid, int, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
