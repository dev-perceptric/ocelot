"use server";

import { revalidatePath } from "next/cache";
import { audit, requireAdmin } from "@/lib/admin";
import { createAdmin } from "@/lib/supabase/server";

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
