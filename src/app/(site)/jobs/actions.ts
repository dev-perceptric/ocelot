"use server";

import type { Job, Org } from "@/lib/jobs";
import { myTimeZone } from "@/lib/myTz";
import { DEFAULT_TZ } from "@/lib/profile";
import { getJob } from "@/lib/queries";
import { createClient, currentUser } from "@/lib/supabase/server";
import { supabaseReady } from "@/lib/env";
import type { Stage } from "@/lib/tracker";

export type PanelJob = {
  job: Job;
  org: Pick<Org, "name" | "slug" | "logo_url" | "business_verified_at" | "email_verified_domain">;
  questions: string[];
  signedIn: boolean;
  card: { id: string; stage: Stage } | null;
  applied: { day: string; cardId: string | null } | null;
};

// One job for the panel beside the Find jobs list: the same data the job page loads, including the person's own
// tracker card and application, so Save and Apply behave the same in both places.
export async function jobPanel(slug: string): Promise<PanelJob | null> {
  if (typeof slug !== "string" || !/^[a-z0-9-]{1,200}$/.test(slug)) return null;
  const job = await getJob(slug);
  if (!job) return null;
  const { supabase, user } = await currentUser();
  const [{ data: card }, { data: sent }] = user ? await Promise.all([
    supabase.from("tracker_items").select("id, stage, application_id").eq("job_id", job.id).order("created_at").limit(1).maybeSingle(),
    supabase.from("applications").select("id, submitted_at").eq("job_id", job.id).eq("candidate_id", user.id).maybeSingle(),
  ]) : [{ data: null }, { data: null }];
  const tz = user && sent ? await myTimeZone(supabase, user.id) : DEFAULT_TZ;
  const { org, questions, ...rest } = job;
  return {
    job: rest as Job,
    org: { name: org.name, slug: org.slug, logo_url: org.logo_url, business_verified_at: org.business_verified_at, email_verified_domain: org.email_verified_domain },
    questions,
    signedIn: Boolean(user),
    card: card ? { id: card.id, stage: card.stage as Stage } : null,
    applied: sent ? {
      day: new Date(sent.submitted_at).toLocaleDateString("en-GB", { timeZone: tz, day: "numeric", month: "short" }),
      cardId: card?.application_id === sent.id ? card.id : null,
    } : null,
  };
}

export type Suggestion = { kind: "title" | "company"; label: string; slug: string | null; jobs: number };

// What the search box suggests while someone types: job titles and companies with live jobs (search_suggestions,
// 035_jobs_ui.sql).
export async function suggest(q: string): Promise<Suggestion[]> {
  const text = typeof q === "string" ? q.trim().slice(0, 80) : "";
  if (text.length < 2 || !supabaseReady) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_suggestions", { p_q: text });
  if (error) { console.error("suggest", error); return []; }
  return (data ?? []).map((s) => ({ kind: s.kind === "company" ? "company" : "title", label: s.label, slug: s.slug, jobs: Number(s.jobs) }));
}
