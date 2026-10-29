import "server-only";
import { SITE_URL } from "@/lib/env";
import { formatWhere, type Job } from "@/lib/jobs";
import { filtersQuery, fromSaved } from "@/lib/search";
import { createAdmin } from "@/lib/supabase/server";
import { queueEmail } from "@/lib/email/send";
import { jobAlert, taskReminder, weeklyDigest, type JobLine } from "@/lib/email/templates";

// What the hourly run does. Each part asks the database what's due, queues the emails, then marks them done,
// so a run that stops halfway sends the rest next hour.

async function toLines(jobs: Job[]): Promise<JobLine[]> {
  if (!jobs.length) return [];
  // The server skips the row rules, so suspended companies are left out here.
  const { data: orgs } = await createAdmin().from("orgs").select("id, name").is("suspended_at", null).in("id", [...new Set(jobs.map((j) => j.org_id))]);
  const name = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  return jobs.filter((j) => name.has(j.org_id))
    .map((j) => ({ title: j.title, company: name.get(j.org_id) ?? "", where: formatWhere(j), url: `${SITE_URL}/jobs/${j.slug}` }));
}

export async function runAlerts(): Promise<number> {
  const db = createAdmin();
  const { data: due, error } = await db.rpc("due_alerts", { p_limit: 200 });
  if (error) throw error;
  let sent = 0;
  for (const s of due ?? []) {
    const startedAt = new Date().toISOString();
    const { data: jobs, error: e } = await db.rpc("alert_jobs", { p_search: s.id });
    if (e) throw e;
    const found = await toLines((jobs ?? []) as Job[]);
    if (found.length) {
      const f = fromSaved(s.query, s.filters);
      await queueEmail({ to: s.email, userId: s.user_id, kind: "job_alert",
        email: jobAlert({ name: s.name, jobs: found, searchUrl: `${SITE_URL}/jobs${filtersQuery(f)}`, siteUrl: SITE_URL }) });
      sent++;
    }
    await db.from("saved_searches").update({ checked_at: startedAt }).eq("id", s.id);
  }
  return sent;
}

export async function runReminders(): Promise<number> {
  const db = createAdmin();
  const { data: due, error } = await db.rpc("due_reminders", { p_limit: 500 });
  if (error) throw error;
  for (const r of due ?? []) {
    const tasks = (r.tasks as { id: string; title: string; due_at: string; job: string | null }[]) ?? [];
    const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: r.time_zone, hour: "2-digit", minute: "2-digit" });
    await queueEmail({ to: r.email, userId: r.user_id, kind: "task_reminder",
      email: taskReminder({ tasks: tasks.map((t) => ({ title: t.title, when: time(t.due_at), job: t.job })), tasksUrl: `${SITE_URL}/app/tasks`, siteUrl: SITE_URL }) });
    await db.from("tasks").update({ reminded_at: new Date().toISOString() }).in("id", tasks.map((t) => t.id));
  }
  return due?.length ?? 0;
}

export async function runDigests(): Promise<number> {
  const db = createAdmin();
  const { data: due, error } = await db.rpc("due_digests", { p_limit: 1000 });
  if (error) throw error;
  if (!due?.length) return 0;
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const now = new Date().toISOString();
  const [{ data: featured }, { data: latest }] = await Promise.all([
    db.rpc("search_jobs", {}).gt("featured_until", now).limit(3),
    db.rpc("search_jobs", {}).gt("published_at", weekAgo).order("published_at", { ascending: false }).limit(13),
  ]);
  const top = (featured ?? []) as Job[];
  const rest = ((latest ?? []) as Job[]).filter((j) => !top.some((t) => t.id === j.id)).slice(0, 10);
  const [f, l] = await Promise.all([toLines(top), toLines(rest)]);
  let sent = 0;
  for (const d of due) {
    if (f.length || l.length) {
      await queueEmail({ to: d.email, userId: d.user_id, kind: "weekly_digest", email: weeklyDigest({ featured: f, latest: l, siteUrl: SITE_URL }) });
      sent++;
    }
    await db.from("notification_prefs").update({ digest_sent_at: now }).eq("user_id", d.user_id);
  }
  return sent;
}
