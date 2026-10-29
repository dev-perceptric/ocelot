"use server";

import { redirect } from "next/navigation";
import { SITE_URL } from "@/lib/env";
import { queueEmail } from "@/lib/email/send";
import { applicationSent } from "@/lib/email/templates";
import { currentUser } from "@/lib/supabase/server";

export type ApplyState = { error?: string; errors?: { full_name?: string; phone?: string; resume?: string; note?: string } & Record<string, string> };

// The database function checks the job, the résumé and the answers, and copies what was sent.
// Its messages are written for people, so they're shown as they are.
const OWN = /^(Log in|This job|You can't|You already|You've sent|Choose your|Add your|Keep the|Keep each|Answer the)/;

export async function applyToJob(_: ApplyState, form: FormData): Promise<ApplyState> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Your session ended. Log in again." };
  const slug = String(form.get("slug") ?? "");
  const { data: job } = await supabase.from("jobs").select("id, title, org:orgs(name), job_questions(id, required)").eq("slug", slug).maybeSingle();
  if (!job) return { error: "This job isn't taking applications." };

  const errors: NonNullable<ApplyState["errors"]> = {};
  const full_name = String(form.get("full_name") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const resume = String(form.get("resume") ?? "");
  const note = String(form.get("note") ?? "").trim();
  if (!full_name) errors.full_name = "Add your name.";
  else if (full_name.length > 120) errors.full_name = "Keep your name under 120 characters.";
  if (phone && !/^\+?[0-9 ()-]{6,20}$/.test(phone)) errors.phone = "Enter a phone number with digits only, like +84 90 123 4567.";
  if (!resume) errors.resume = "Choose your résumé.";
  if (note.length > 3000) errors.note = "Keep the note under 3,000 characters.";
  const answers: Record<string, string> = {};
  for (const q of job.job_questions ?? []) {
    const a = String(form.get(`q_${q.id}`) ?? "").trim();
    if (q.required && !a) errors[`q_${q.id}`] = "Answer this question.";
    else if (a.length > 2000) errors[`q_${q.id}`] = "Keep your answer under 2,000 characters.";
    answers[q.id] = a;
  }
  if (Object.keys(errors).length) return { errors };

  const { error: profileError } = await supabase.from("profiles").update({ full_name, phone: phone || null }).eq("id", user.id);
  if (profileError) return { error: "That didn't send. Try again." };
  const { data: appId, error } = await supabase.rpc("apply_to_job", { p_job: job.id, p_resume: resume, p_answers: answers, p_note: note });
  if (error || !appId) {
    if (error?.code === "23505") return { error: "You already applied to this job." };
    return { error: error && OWN.test(error.message) ? error.message : "That didn't send. Try again." };
  }

  const { data: card } = await supabase.from("tracker_items").select("id").eq("application_id", appId).maybeSingle();
  const cardUrl = `${SITE_URL}/app/tracker${card ? `/${card.id}` : ""}`;
  const company = (job.org as unknown as { name: string } | null)?.name ?? "the company";
  try {
    if (user.email) await queueEmail({ to: user.email, userId: user.id, kind: "application_sent", email: applicationSent({ job: job.title, company, cardUrl }) });
  } catch (e) {
    console.error("receipt email not queued", e);
  }
  redirect(card ? `/app/tracker/${card.id}` : "/app/tracker");
}
