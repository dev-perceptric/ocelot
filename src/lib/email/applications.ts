import "server-only";
import { SITE_URL } from "@/lib/env";
import { createAdmin } from "@/lib/supabase/server";
import { queueEmail } from "./send";
import { newApplicant, stageUpdate, STAGE_EMAIL, type StageEmail } from "./templates";

// Emails about applications. Callers pass only ids the person was just allowed to change (the row rules
// decided that), so reading names and addresses with the service role here is safe.

// Stage emails wait this long, so a mis-click moved back in time never reaches the candidate.
export const STAGE_EMAIL_DELAY_MINUTES = 10;

const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null;

export async function emailNewApplicant(applicationId: string) {
  const db = createAdmin();
  const { data: app } = await db.from("applications").select("id, org_id, snapshot, job:jobs(title), org:orgs(name, agency_id)").eq("id", applicationId).single();
  if (!app) return;
  // The company's own team, and the staff of the agency that manages it. Each person once.
  const agencyId = one<{ agency_id: string | null }>(app.org)?.agency_id ?? null;
  const [{ data: team }, { data: staff }] = await Promise.all([
    db.from("org_members").select("user_id, profile:profiles(email)").eq("org_id", app.org_id),
    agencyId ? db.from("agency_members").select("user_id, profile:profiles(email)").eq("agency_id", agencyId) : Promise.resolve({ data: [] }),
  ]);
  const members = [...(team ?? []), ...(staff ?? [])].filter((m, i, all) => all.findIndex((x) => x.user_id === m.user_id) === i);
  const name = (app.snapshot as { name?: string })?.name ?? "Someone";
  const job = one<{ title: string }>(app.job)?.title ?? "your job";
  const company = one<{ name: string }>(app.org)?.name ?? "your company";
  for (const m of members) {
    const to = one<{ email: string | null }>(m.profile)?.email;
    if (!to) continue;
    await queueEmail({ to, userId: m.user_id, kind: "new_applicant",
      email: newApplicant({ company, job, name, url: `${SITE_URL}/employer/applicants/${app.id}`, siteUrl: SITE_URL }) });
  }
}

export async function emailStageChange(applicationIds: string[], stage: string) {
  if (!applicationIds.length || !(STAGE_EMAIL as readonly string[]).includes(stage)) return;
  const db = createAdmin();
  const { data: apps } = await db.from("applications").select("id, candidate_id, agency_name, job:jobs(title), org:orgs(name)")
    .in("id", applicationIds).eq("hiring_stage", stage).not("candidate_id", "is", null);
  const runAt = new Date(Date.now() + STAGE_EMAIL_DELAY_MINUTES * 60_000);
  for (const a of apps ?? []) {
    const [{ data: profile }, { data: card }] = await Promise.all([
      db.from("profiles").select("email").eq("id", a.candidate_id!).maybeSingle(),
      db.from("tracker_items").select("id").eq("application_id", a.id).maybeSingle(),
    ]);
    if (!profile?.email) continue;
    await queueEmail({
      to: profile.email, userId: a.candidate_id, kind: `stage_${stage}`, runAt, onlyIfStage: { application_id: a.id, stage },
      email: stageUpdate({
        company: one<{ name: string }>(a.org)?.name ?? "The company", job: one<{ title: string }>(a.job)?.title ?? "the job",
        stage: stage as StageEmail, cardUrl: `${SITE_URL}/app/tracker${card ? `/${card.id}` : ""}`, siteUrl: SITE_URL, agency: a.agency_name,
      }),
    });
  }
}
