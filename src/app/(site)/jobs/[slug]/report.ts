"use server";

import { headers } from "next/headers";
import { SITE_URL } from "@/lib/env";
import { queueEmail } from "@/lib/email/send";
import { REPORT_REASONS, reportReceived } from "@/lib/email/templates";
import { createAdmin, currentUser } from "@/lib/supabase/server";

export type ReportState = { error?: string; done?: boolean };

// Visitors' reports, per address, per hour. One server in Singapore, so memory is enough for now.
const recent = new Map<string, number[]>();
function tooMany(key: string, limit = 5) {
  const now = Date.now();
  const list = (recent.get(key) ?? []).filter((t) => now - t < 3_600_000);
  if (list.length >= limit) return true;
  recent.set(key, [...list, now]);
  return false;
}

export async function submitReport(_: ReportState, form: FormData): Promise<ReportState> {
  const slug = String(form.get("slug") ?? "");
  const reason = String(form.get("reason") ?? "");
  const details = String(form.get("details") ?? "").trim().slice(0, 2000);
  const contact = String(form.get("contact_email") ?? "").trim().toLowerCase();
  if (!REPORT_REASONS[reason]) return { error: "Choose a reason." };
  if (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return { error: "Enter a valid email, or leave it empty." };

  const db = createAdmin();
  const { data: job } = await db.from("jobs").select("id, title, org_id, status, published_at, org:orgs(name)").eq("slug", slug).maybeSingle();
  if (!job || !job.published_at || !["published", "closed", "expired"].includes(job.status)) return { error: "This job can't be reported." };

  const { supabase, user } = await currentUser();
  if (user) {
    const { error } = await supabase.from("reports").insert({ reporter_id: user.id, job_id: job.id, org_id: job.org_id, reason, details, contact_email: user.email ?? null });
    if (error?.code === "23505") return { done: true }; // already reported; it's being looked at
    if (error) return { error: "The report didn't send. Try again." };
  } else {
    const h = await headers();
    const ip = h.get("fly-client-ip") ?? h.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    // Checked by the server before saving with the service role: a real public job, and limits on volume.
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await db.from("reports").select("id", { count: "exact", head: true }).eq("job_id", job.id).is("reporter_id", null).gte("created_at", since);
    if (tooMany(ip) || (count ?? 0) >= 20) return { error: "Too many reports right now. Try again later, or log in to report." };
    const { error } = await db.from("reports").insert({ reporter_id: null, job_id: job.id, org_id: job.org_id, reason, details, contact_email: contact || null });
    if (error) return { error: "The report didn't send. Try again." };
  }

  // Tell Ocelot's admins.
  const { data: admins } = await db.from("platform_admins").select("user_id");
  const ids = (admins ?? []).map((a) => a.user_id);
  const { data: people } = ids.length ? await db.from("profiles").select("id, email").in("id", ids) : { data: [] };
  for (const a of people ?? []) {
    const email = a.email;
    if (email) {
      await queueEmail({ to: email, userId: a.id, kind: "report_received", email: reportReceived({
        job: job.title, company: (job.org as unknown as { name: string } | null)?.name ?? "a company", reason, details, reviewUrl: `${SITE_URL}/admin/reports`,
      }) }).catch((e) => console.error("report email", e));
    }
  }
  return { done: true };
}
