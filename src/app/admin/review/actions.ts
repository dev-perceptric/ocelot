"use server";

import { revalidatePath } from "next/cache";
import { audit, requireAdmin } from "@/lib/admin";
import { SITE_URL } from "@/lib/env";
import { queueEmail } from "@/lib/email/send";
import { jobPublished, jobSentBack } from "@/lib/email/templates";
import { createAdmin } from "@/lib/supabase/server";

type Result = { ok: boolean; message?: string };

// The company's owners and admins, plus whoever wrote the job.
async function recipients(orgId: string, createdBy: string | null) {
  const db = createAdmin();
  const { data } = await db.from("org_members").select("user_id, role, profile:profiles(email)").eq("org_id", orgId);
  const ids = new Set((data ?? []).filter((m) => m.role !== "member" || m.user_id === createdBy).map((m) => m.user_id));
  return (data ?? []).filter((m) => ids.has(m.user_id)).map((m) => ({ userId: m.user_id, email: (m.profile as unknown as { email: string | null })?.email }))
    .filter((r): r is { userId: string; email: string } => Boolean(r.email));
}

async function load(jobId: string) {
  const { data } = await createAdmin().from("jobs").select("id, title, slug, org_id, created_by, expires_at, org:orgs(name)").eq("id", jobId).single();
  return data;
}

export async function publish(jobId: string): Promise<Result> {
  const { user } = await requireAdmin();
  const { error } = await createAdmin().rpc("publish_job", { p_job: jobId });
  if (error) return { ok: false, message: error.message };
  const job = await load(jobId);
  await audit(user.id, "job.publish", { table: "jobs", id: jobId });
  if (job) {
    const until = job.expires_at ? new Date(job.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : "";
    for (const r of await recipients(job.org_id, job.created_by)) {
      await queueEmail({ to: r.email, userId: r.userId, kind: "job_published", email: jobPublished({
        company: (job.org as unknown as { name: string })?.name ?? "Your company", title: job.title,
        jobUrl: `${SITE_URL}/jobs/${job.slug}`, manageUrl: `${SITE_URL}/employer/jobs/${job.id}`, until,
      }) });
    }
  }
  revalidatePath("/admin/review");
  revalidatePath("/jobs");
  return { ok: true };
}

export async function sendBack(jobId: string, note: string): Promise<Result> {
  const { user } = await requireAdmin();
  const { error } = await createAdmin().rpc("send_back_job", { p_job: jobId, p_note: note });
  if (error) return { ok: false, message: error.message };
  const job = await load(jobId);
  await audit(user.id, "job.send_back", { table: "jobs", id: jobId }, { note: note.trim() });
  if (job) {
    for (const r of await recipients(job.org_id, job.created_by)) {
      await queueEmail({ to: r.email, userId: r.userId, kind: "job_sent_back", email: jobSentBack({
        title: job.title, note: note.trim(), editUrl: `${SITE_URL}/employer/jobs/${job.id}`,
      }) });
    }
  }
  revalidatePath("/admin/review");
  return { ok: true };
}
