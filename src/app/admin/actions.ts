"use server";

import { revalidatePath } from "next/cache";
import { audit, requireAdmin } from "@/lib/admin";
import { createAdmin } from "@/lib/supabase/server";
import { refundPayment, stripeEnv } from "@/lib/stripe";

type Result = { ok: boolean; message?: string };
const done = (paths: string[]): Result => { paths.forEach((p) => revalidatePath(p)); return { ok: true }; };

// ---------- Companies ----------

export async function verifyCompany(orgId: string, note: string): Promise<Result> {
  const { user } = await requireAdmin();
  if (!note.trim()) return { ok: false, message: "Say what you checked." };
  const { error } = await createAdmin().from("orgs")
    .update({ business_verified_at: new Date().toISOString(), business_verified_note: note.trim() }).eq("id", orgId);
  if (error) return { ok: false, message: error.message };
  await audit(user.id, "company.verify", { table: "orgs", id: orgId }, { note: note.trim() });
  return done([`/admin/companies/${orgId}`, "/admin/companies"]);
}

export async function unverifyCompany(orgId: string): Promise<Result> {
  const { user } = await requireAdmin();
  const { error } = await createAdmin().from("orgs").update({ business_verified_at: null, business_verified_note: null }).eq("id", orgId);
  if (error) return { ok: false, message: error.message };
  await audit(user.id, "company.unverify", { table: "orgs", id: orgId });
  return done([`/admin/companies/${orgId}`, "/admin/companies"]);
}

export async function setTrusted(orgId: string, trusted: boolean): Promise<Result> {
  const { user } = await requireAdmin();
  const { error } = await createAdmin().from("orgs").update({ trusted }).eq("id", orgId);
  if (error) return { ok: false, message: error.message };
  await audit(user.id, trusted ? "company.trust" : "company.untrust", { table: "orgs", id: orgId });
  return done([`/admin/companies/${orgId}`]);
}

export async function suspendCompany(orgId: string, reason: string): Promise<Result> {
  const { user } = await requireAdmin();
  if (!reason.trim()) return { ok: false, message: "Give a reason." };
  const { error } = await createAdmin().from("orgs")
    .update({ suspended_at: new Date().toISOString(), suspended_reason: reason.trim() }).eq("id", orgId);
  if (error) return { ok: false, message: error.message };
  await audit(user.id, "company.suspend", { table: "orgs", id: orgId }, { reason: reason.trim() });
  return done([`/admin/companies/${orgId}`, "/admin/companies", "/jobs", "/"]);
}

export async function unsuspendCompany(orgId: string): Promise<Result> {
  const { user } = await requireAdmin();
  const { error } = await createAdmin().from("orgs").update({ suspended_at: null, suspended_reason: null }).eq("id", orgId);
  if (error) return { ok: false, message: error.message };
  await audit(user.id, "company.unsuspend", { table: "orgs", id: orgId });
  return done([`/admin/companies/${orgId}`, "/admin/companies", "/jobs", "/"]);
}

// ---------- People ----------

export async function suspendPerson(userId: string, reason: string): Promise<Result> {
  const { user } = await requireAdmin();
  if (userId === user.id) return { ok: false, message: "You can't suspend yourself." };
  if (!reason.trim()) return { ok: false, message: "Give a reason." };
  const db = createAdmin();
  if ((await db.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle()).data) {
    return { ok: false, message: "Remove their admin access first." };
  }
  // Supabase stops their sign-in and refresh for the ban period (100 years: until lifted).
  const { error } = await db.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  if (error) return { ok: false, message: error.message };
  await audit(user.id, "person.suspend", { table: "auth.users", id: userId }, { reason: reason.trim() });
  return done([`/admin/people/${userId}`, "/admin/people"]);
}

export async function unsuspendPerson(userId: string): Promise<Result> {
  const { user } = await requireAdmin();
  const { error } = await createAdmin().auth.admin.updateUserById(userId, { ban_duration: "none" });
  if (error) return { ok: false, message: error.message };
  await audit(user.id, "person.unsuspend", { table: "auth.users", id: userId });
  return done([`/admin/people/${userId}`, "/admin/people"]);
}

// ---------- Queue ----------

export async function retryTask(id: number): Promise<Result> {
  const { user } = await requireAdmin();
  const { error } = await createAdmin().from("jobs_queue")
    .update({ done_at: null, locked_at: null, attempts: 0, error: null, run_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  await audit(user.id, "queue.retry", { table: "jobs_queue", id: null }, { task: id });
  return done(["/admin/queue"]);
}

// ---------- Reports ----------

export async function handleReport(id: string, status: "actioned" | "dismissed", note: string): Promise<Result> {
  const { user } = await requireAdmin();
  const { error } = await createAdmin().from("reports")
    .update({ status, admin_note: note.trim() || null, handled_by: user.id, handled_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  await audit(user.id, `report.${status}`, { table: "reports", id }, note.trim() ? { note: note.trim() } : {});
  return done(["/admin/reports", "/admin"]);
}

// ---------- Billing ----------

export async function setPayments(on: boolean): Promise<Result> {
  const { user } = await requireAdmin();
  if (on && (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET)) {
    return { ok: false, message: "Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET first (docs/setup.md)." };
  }
  const { error } = await createAdmin().rpc("set_payments", { p_on: on });
  if (error) return { ok: false, message: error.message };
  await audit(user.id, on ? "billing.payments_on" : "billing.payments_off", { table: "app_settings", id: null });
  return done(["/admin/billing"]);
}

export async function grantCredits(orgId: string, count: number): Promise<Result> {
  const { user } = await requireAdmin();
  if (!Number.isInteger(count) || count < 1 || count > 20) return { ok: false, message: "Give between 1 and 20 credits." };
  const { error } = await createAdmin().rpc("grant_credits", { p_org: orgId, p_count: count, p_admin: user.id });
  if (error) return { ok: false, message: error.message };
  await audit(user.id, "billing.grant_credits", { table: "orgs", id: orgId }, { count });
  return done([`/admin/companies/${orgId}`]);
}

// Refunds through Stripe first, then removes the credit. Only for listings that never went live.
export async function refundOrder(orderId: string): Promise<Result> {
  const { user } = await requireAdmin();
  const db = createAdmin();
  const { data: ok } = await db.rpc("can_refund", { p_order: orderId });
  if (!ok) return { ok: false, message: "This order can't be refunded. Its listing went live or it isn't paid." };
  const { data: order } = await db.from("orders").select("stripe_payment_intent, amount_cents").eq("id", orderId).single();
  if (order?.stripe_payment_intent) {
    try {
      await refundPayment(stripeEnv(), order.stripe_payment_intent);
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Stripe didn't refund it." };
    }
  }
  const { error } = await db.rpc("refund_order", { p_order: orderId });
  if (error) return { ok: false, message: `Stripe refunded it, but the order didn't update: ${error.message}` };
  await audit(user.id, "billing.refund", { table: "orders", id: orderId }, { amount_cents: order?.amount_cents });
  return done(["/admin/billing"]);
}
