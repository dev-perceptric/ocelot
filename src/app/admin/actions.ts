"use server";

import { revalidatePath } from "next/cache";
import { audit, requireAdmin } from "@/lib/admin";
import { createAdmin } from "@/lib/supabase/server";
import { refundPayment, stripeEnv } from "@/lib/stripe";
import { PROVIDERS, feedUrl, parseBoardLink } from "@/lib/ats/boards";
import { syncSource } from "@/lib/ats/sync";
import { slugify } from "@/lib/jobs";
import { COUNTRIES } from "@/lib/places";

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

// ---------- Job boards ----------

export type SourceState = { error?: string; done?: string };

// Adds a company's public job board. Checks the board loads first, then makes the company if it's new,
// saves the board and runs the first sync.
export async function addSource(_: SourceState, form: FormData): Promise<SourceState> {
  const { user } = await requireAdmin();
  const link = parseBoardLink(String(form.get("link") ?? ""));
  if (!link) return { error: "Paste a job board link from Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee or Workable." };
  const countries = form.getAll("countries").map(String).filter((c) => COUNTRIES.some((k) => k.country_code === c));
  if (!countries.length) return { error: "Choose at least one country." };
  const orgId = String(form.get("org_id") ?? "");
  const newName = String(form.get("company") ?? "").trim();
  if (!orgId && !newName) return { error: "Choose a company or name a new one." };
  const db = createAdmin();
  const { data: dup } = await db.from("job_sources").select("id").eq("provider", link.provider).eq("board", link.board).maybeSingle();
  if (dup) return { error: "This board is already added." };
  try {
    const res = await fetch(feedUrl(link.provider, link.board, process.env.ATS_TEST_URL), { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return { error: res.status === 404 ? "That board wasn't found. Check the link." : `The board answered ${res.status}. Try again later.` };
  } catch {
    return { error: "The board didn't answer. Try again later." };
  }

  let org = orgId;
  if (!org) {
    if (newName.length > 120) return { error: "Keep the company name under 120 characters." };
    const base = slugify(newName) || "company";
    const { data: taken } = await db.from("orgs").select("slug").like("slug", `${base}%`);
    const used = new Set((taken ?? []).map((t) => t.slug));
    let slug = base;
    for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;
    const { data: made, error } = await db.from("orgs").insert({ name: newName, slug, created_by: user.id }).select("id").single();
    if (error || !made) return { error: error?.message ?? "The company didn't save." };
    org = made.id;
    await audit(user.id, "company.create_for_board", { table: "orgs", id: org }, { name: newName });
  }
  const { data: src, error } = await db.from("job_sources").insert({
    org_id: org, provider: link.provider, board: link.board, countries, niche_only: form.get("niche_only") === "on", created_by: user.id,
  }).select("*").single();
  if (error || !src) return { error: error?.message ?? "The board didn't save." };
  await audit(user.id, "board.add", { table: "job_sources", id: src.id }, { provider: link.provider, board: link.board });
  revalidatePath("/admin/sources");
  try {
    const r = await syncSource(src);
    return { done: `${PROVIDERS[link.provider].name} board added. ${r.imported} of ${r.seen} jobs came in.` };
  } catch (e) {
    return { done: `Board added, but the first sync failed: ${e instanceof Error ? e.message : "unknown error"}` };
  }
}

export async function syncSourceNow(id: string): Promise<Result & { line?: string }> {
  const { user } = await requireAdmin();
  const { data: src } = await createAdmin().from("job_sources").select("*").eq("id", id).single();
  if (!src) return { ok: false, message: "Board not found." };
  try {
    const r = await syncSource(src);
    await audit(user.id, "board.sync", { table: "job_sources", id }, { ...r });
    revalidatePath("/admin/sources");
    return { ok: true, line: `${r.imported} of ${r.seen} jobs: ${r.added} new, ${r.closed} closed` };
  } catch (e) {
    revalidatePath("/admin/sources");
    return { ok: false, message: e instanceof Error ? e.message : "The sync failed." };
  }
}

export async function setSourceActive(id: string, active: boolean): Promise<Result> {
  const { user } = await requireAdmin();
  const { error } = await createAdmin().from("job_sources").update({ active }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  await audit(user.id, active ? "board.resume" : "board.pause", { table: "job_sources", id });
  return done(["/admin/sources"]);
}

// Removes a board. Its live jobs close; their pages stay, marked closed.
export async function deleteSource(id: string): Promise<Result> {
  const { user } = await requireAdmin();
  const db = createAdmin();
  const { error: e1 } = await db.from("jobs").update({ status: "closed" }).eq("source_id", id).eq("status", "published");
  if (e1) return { ok: false, message: e1.message };
  const { error } = await db.from("job_sources").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  await audit(user.id, "board.delete", { table: "job_sources", id });
  return done(["/admin/sources", "/jobs"]);
}
