-- Milestone 5 part 1: listing credits and payment.
-- With payments on, a job that has never been live needs a listing credit to go to review or go live.
-- Credits come from Stripe payments (the webhook) or from Ocelot (founding credits). Only the server writes them.

-- ---------- The payments switch ----------
create table public.app_settings (
  id boolean primary key default true check (id),
  payments_on boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.app_settings default values;
alter table public.app_settings enable row level security;
create policy app_settings_read on public.app_settings for select using (true);
revoke insert, update, delete on public.app_settings from anon, authenticated;

create or replace function public.payments_on() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select payments_on from app_settings), false)
$$;

-- ---------- Orders and credits ----------
alter table public.orders
  add column created_by uuid references auth.users(id) on delete set null,
  add column paid_at timestamptz,
  add column refunded_at timestamptz,
  add column stripe_payment_intent text,
  add column receipt_url text;
create index orders_org on public.orders(org_id, created_at desc);
-- Orders are financial records: they stay when a company is deleted, with its name kept on them.
alter table public.orders add column org_name text;
alter table public.orders drop constraint orders_org_id_fkey;
alter table public.orders alter column org_id drop not null;
alter table public.orders add constraint orders_org_id_fkey foreign key (org_id) references public.orgs(id) on delete set null;
create or replace function public.order_org_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.org_id is not null then select name into new.org_name from orgs where id = new.org_id; end if;
  return new;
end $$;
create trigger orders_org_name before insert on public.orders for each row execute function public.order_org_name();

alter table public.entitlements add column granted_by uuid references auth.users(id) on delete set null;
alter table public.entitlements add constraint entitlements_used check ((job_id is null) = (used_at is null));
create unique index entitlements_one_per_order on public.entitlements(order_id) where order_id is not null;
create unique index entitlements_one_per_job on public.entitlements(job_id) where job_id is not null;
create index entitlements_free on public.entitlements(org_id, created_at) where job_id is null;

-- What's missing before a job can go to review (null when it's ready). For the company's own jobs only.
create or replace function public.job_ready(p_job uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v jobs%rowtype;
begin
  select * into v from jobs where id = p_job;
  if not found or not is_org_member(v.org_id) then raise exception 'Job not found'; end if;
  return job_missing(v);
end $$;

-- Puts one of the company's unused credits on a job. Founding credits go first, then the oldest.
-- A job keeps the credit it has; asking again returns its package.
create or replace function public.attach_credit(p_job uuid, p_package text default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_job jobs%rowtype; v_ent uuid; v_pkg text;
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
  if v_ent is null then raise exception 'No listing credit left. Buy one to send this job for review.'; end if;
  update entitlements set job_id = p_job, used_at = now() where id = v_ent;
  return v_pkg;
end $$;
revoke execute on function public.attach_credit(uuid, text), public.job_ready(uuid) from public, anon;
grant execute on function public.attach_credit(uuid, text), public.job_ready(uuid) to authenticated;

-- A deleted draft gives its credit back.
create or replace function public.return_credit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update entitlements set job_id = null, used_at = null where job_id = old.id;
  return old;
end $$;
create trigger jobs_return_credit before delete on public.jobs for each row execute function public.return_credit();

-- The gate. Runs after jobs_guard (triggers run by name), so it also sees trusted companies publishing at once.
-- Jobs that were live before (published_at set) were already counted and pass.
create or replace function public.jobs_payment_gate() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pkg text;
begin
  if new.status is not distinct from old.status or old.published_at is not null then return new; end if;
  if new.status not in ('pending_review', 'published') then return new; end if;
  select package into v_pkg from entitlements where job_id = new.id;
  if v_pkg is null and payments_on() then
    raise exception 'No listing credit left. Buy one to send this job for review.';
  end if;
  if new.status = 'published' and v_pkg = 'featured' then
    new.featured_until := coalesce(new.published_at, now()) + interval '7 days';
  end if;
  return new;
end $$;
create trigger jobs_payment_gate before update on public.jobs for each row execute function public.jobs_payment_gate();

-- ---------- Server only: payment, refunds, founding credits, the switch ----------

-- The Stripe webhook after it checks the signature. Handles each Stripe event once. Marks the order paid,
-- adds its credit, and when the order was for a job: attaches the credit and sends the job to review
-- (or publishes it for a trusted company), the same as the company's own button would.
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
  update orders set status = 'paid', paid_at = now(), stripe_payment_intent = p_payment_intent where id = p_order;
  insert into entitlements (org_id, order_id, package) values (v_order.org_id, v_order.id, v_order.package) returning id into v_ent;

  if v_order.job_id is null then return 'credit added'; end if;
  select * into v_job from jobs where id = v_order.job_id for update;
  if not found or v_job.org_id <> v_order.org_id or exists (select 1 from entitlements where job_id = v_job.id) then
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

-- Refunds only for listings that never went live. Called after Stripe has refunded the payment.
create or replace function public.refund_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_order orders%rowtype; v_job uuid;
begin
  select * into v_order from orders where id = p_order for update;
  if not found or v_order.status <> 'paid' then raise exception 'Only paid orders can be refunded'; end if;
  select job_id into v_job from entitlements where order_id = p_order;
  if v_job is not null and exists (select 1 from jobs where id = v_job and published_at is not null) then
    raise exception 'This listing went live, so it can''t be refunded here';
  end if;
  delete from entitlements where order_id = p_order;
  if v_job is not null then
    update jobs set status = 'draft' where id = v_job and status in ('pending_review', 'rejected');
  end if;
  update orders set status = 'refunded', refunded_at = now() where id = p_order;
end $$;

create or replace function public.can_refund(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from orders o where o.id = p_order and o.status = 'paid')
    and not exists (select 1 from entitlements e join jobs j on j.id = e.job_id where e.order_id = p_order and j.published_at is not null)
$$;

create or replace function public.grant_credits(p_org uuid, p_count int, p_admin uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_count not between 1 and 20 then raise exception 'Give between 1 and 20 credits'; end if;
  insert into entitlements (org_id, package, granted_by) select p_org, 'founding', p_admin from generate_series(1, p_count);
end $$;

create or replace function public.set_payments(p_on boolean) returns void
language sql security definer set search_path = public as $$
  update app_settings set payments_on = p_on, updated_at = now()
$$;

revoke execute on function public.record_payment(text, text, uuid, text, int, text, text), public.refund_order(uuid),
  public.can_refund(uuid), public.grant_credits(uuid, int, uuid), public.set_payments(boolean) from public, anon, authenticated;
