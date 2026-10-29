"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { readJob, type JobErrors } from "@/lib/jobForm";
import { slugify } from "@/lib/jobs";
import { myOrgs } from "@/lib/org";

export type JobState = { errors?: JobErrors; error?: string; savedAt?: number; sentAt?: number };

// Database rules raise plain-language messages (job_missing, the status guard); show those, hide the rest.
const say = (e: { message: string } | null, fallback: string) =>
  e && /^[A-Z][^\n]{8,160}$/.test(e.message) && !/violates|permission|relation|column|syntax/i.test(e.message) ? e.message : fallback;

const newSlug = (title: string, company: string) =>
  `${slugify(title) || "job"}-${slugify(company) || "company"}-${Math.random().toString(36).slice(2, 6)}`.slice(0, 100);

async function saveQuestions(supabase: Awaited<ReturnType<typeof myOrgs>>["supabase"], jobId: string, questions: string[]) {
  const { data: old } = await supabase.from("job_questions").select("id, prompt, position").eq("job_id", jobId).order("position");
  const same = (old ?? []).length === questions.length && (old ?? []).every((q, i) => q.prompt === questions[i]);
  if (same) return null;
  const del = await supabase.from("job_questions").delete().eq("job_id", jobId);
  if (del.error) return del.error;
  if (!questions.length) return null;
  const { error } = await supabase.from("job_questions").insert(questions.map((prompt, position) => ({ job_id: jobId, prompt, position })));
  return error;
}

// Saves the form; with intent=review also sends the job for review (the database checks it's complete).
export async function saveJob(_: JobState, form: FormData): Promise<JobState> {
  const { data, questions, errors } = readJob(form);
  if (!data) return { errors };
  const { supabase, user, current } = await myOrgs();
  if (!user || !current) return { error: "Choose a company first." };
  let id = String(form.get("id") ?? "") || null;

  if (!id) {
    const { data: row, error } = await supabase.from("jobs")
      .insert({ ...data, org_id: current.id, slug: newSlug(data.title, current.name), created_by: user.id, status: "draft" })
      .select("id").single();
    if (error || !row) return { error: say(error, "The job didn't save. Try again.") };
    id = row.id;
  } else {
    const { error } = await supabase.from("jobs").update(data).eq("id", id).eq("org_id", current.id);
    if (error) return { error: say(error, "The job didn't save. Try again.") };
  }
  const qErr = await saveQuestions(supabase, id, questions);
  if (qErr) return { error: say(qErr, "The questions didn't save. Try again.") };

  if (form.get("intent") === "review") {
    // With payments on, a job that was never live needs a listing credit: use one the company has, or pay.
    const [{ data: settings }, { data: job }] = await Promise.all([
      supabase.from("app_settings").select("payments_on").maybeSingle(),
      supabase.from("jobs").select("published_at").eq("id", id).single(),
    ]);
    if (settings?.payments_on && !job?.published_at) {
      const { data: missing } = await supabase.rpc("job_ready", { p_job: id });
      if (!missing) {
        const { error: noCredit } = await supabase.rpc("attach_credit", { p_job: id });
        if (noCredit) redirect(`/employer/jobs/${id}?pay=1`);
      }
    }
    const { error } = await supabase.from("jobs").update({ status: "pending_review" }).eq("id", id);
    revalidatePath("/employer/jobs");
    if (error) {
      // Saved as a draft; tell them what's missing on the same page.
      if (!form.get("id")) redirect(`/employer/jobs/${id}?missing=${encodeURIComponent(say(error, "Check the job and try again."))}`);
      return { error: say(error, "Check the job and try again."), savedAt: Date.now() };
    }
    redirect(`/employer/jobs/${id}?sent=1`);
  }
  revalidatePath("/employer/jobs");
  if (!form.get("id")) redirect(`/employer/jobs/${id}?saved=1`);
  return { savedAt: Date.now() };
}

type Result = { ok: boolean; message?: string };

export async function setJobStatus(id: string, status: "draft" | "closed"): Promise<Result> {
  const { supabase, current } = await myOrgs();
  if (!current) return { ok: false };
  const { data, error } = await supabase.from("jobs").update({ status }).eq("id", id).eq("org_id", current.id).select("id");
  revalidatePath("/employer/jobs");
  revalidatePath(`/employer/jobs/${id}`);
  if (!error && !data?.length) return { ok: false, message: "That job wasn't found." };
  return { ok: !error, message: say(error, "That didn't work. Try again.") };
}

export async function duplicateJob(id: string): Promise<Result> {
  const { supabase, user, current } = await myOrgs();
  if (!user || !current) return { ok: false };
  const { data: j } = await supabase.from("jobs").select("*, job_questions(prompt, position)").eq("id", id).eq("org_id", current.id).single();
  if (!j) return { ok: false, message: "That job wasn't found." };
  const { data: row, error } = await supabase.from("jobs").insert({
    org_id: current.id, slug: newSlug(j.title, current.name), created_by: user.id, status: "draft",
    title: `${j.title} (copy)`.slice(0, 140), description: j.description, role: j.role, category: j.category, seniority: j.seniority,
    employment_type: j.employment_type, workplace: j.workplace, office_places: j.office_places, eligible_countries: j.eligible_countries,
    time_zones: j.time_zones, salary_min: j.salary_min, salary_max: j.salary_max, salary_currency: j.salary_currency,
    salary_period: j.salary_period, apply_method: j.apply_method, apply_url: j.apply_url,
  }).select("id").single();
  if (error || !row) return { ok: false, message: say(error, "The copy didn't save. Try again.") };
  const qs = [...(j.job_questions ?? [])].sort((a, b) => a.position - b.position).map((q) => q.prompt);
  await saveQuestions(supabase, row.id, qs);
  redirect(`/employer/jobs/${row.id}?saved=1`);
}

export async function deleteJob(id: string): Promise<Result> {
  const { supabase, current } = await myOrgs();
  if (!current) return { ok: false };
  const { data, error } = await supabase.from("jobs").delete().eq("id", id).eq("org_id", current.id).select("id");
  if (error || !data?.length) return { ok: false, message: "Only drafts that were never published can be deleted. Close it instead." };
  revalidatePath("/employer/jobs");
  redirect("/employer/jobs");
}
