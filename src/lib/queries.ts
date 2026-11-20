import "server-only";
import { supabaseReady } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Job, Org } from "@/lib/jobs";
import type { Filters } from "@/lib/search";

export type JobWithOrg = Job & { org: Pick<Org, "name" | "slug" | "logo_url"> };

export const PAGE_SIZE = 50;

// Job search through search_jobs (supabase/migrations/009_search.sql): only live jobs from companies that
// aren't suspended, promoted first, then taking turns between companies (025_search_mix.sql). A database hiccup shows an empty list instead of an error page.
export async function searchJobs(f: Partial<Filters> = {}, page = 1, size = PAGE_SIZE): Promise<{ jobs: JobWithOrg[]; total: number }> {
  if (!supabaseReady) return { jobs: [], total: 0 };
  const supabase = await createClient();
  const from = (page - 1) * size;
  const { data, error, count } = await supabase
    .rpc("search_jobs", {
      q: f.q || undefined,
      workplaces: f.where?.length ? f.where : undefined,
      country: f.country ?? undefined,
      city: f.city ?? undefined,
      region: f.region ?? undefined,
      category: f.category ?? undefined,
      role: f.role ?? undefined,
      seniorities: f.level?.length ? f.level : undefined,
      types: f.type?.length ? f.type : undefined,
      pay_only: f.pay ?? false,
      posted_days: f.posted ?? undefined,
      min_pay: f.minPay ?? undefined,
      sort: f.sort ?? "best",
    }, { count: "exact" })
    .select("*, org:orgs(name, slug, logo_url)")
    .range(from, from + size - 1);
  if (error) console.error("searchJobs", error);
  return { jobs: (data ?? []) as unknown as JobWithOrg[], total: count ?? 0 };
}

// Companies with live jobs, for the Company filter (the row rules show only those, plus a member's own).
export async function liveCompanies(): Promise<{ name: string; slug: string }[]> {
  if (!supabaseReady) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("live_companies");
  if (error) console.error("liveCompanies", error);
  return data ?? [];
}

export async function listJobs({ limit = 50 }: { limit?: number } = {}): Promise<JobWithOrg[]> {
  return (await searchJobs({}, 1, limit)).jobs;
}

export async function getJob(slug: string): Promise<(Job & { org: Org; questions: string[] }) | null> {
  if (!supabaseReady) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("jobs")
    .select("*, org:orgs(*), job_questions(prompt, position)").eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!data || !data.org) return null;
  const questions = [...(data.job_questions ?? [])].sort((a, b) => a.position - b.position).map((q) => q.prompt);
  return { ...(data as unknown as Job & { org: Org }), questions };
}

// The copy of a job that search shows, when the same job is listed more than once (030_duplicates.sql).
export async function shownCopy(dupeKey: string | null): Promise<string | null> {
  if (!supabaseReady || !dupeKey) return null;
  const { data } = await (await createClient()).rpc("shown_copy", { p_key: dupeKey });
  return data ?? null;
}

export async function getOrg(slug: string): Promise<{ org: Org; jobs: Job[] } | { movedTo: string } | null> {
  if (!supabaseReady) return null;
  const supabase = await createClient();
  const { data: org } = await supabase.from("orgs").select("*").eq("slug", slug).maybeSingle();
  if (!org) {
    // An old address: send people (and search engines) to the company's current one.
    const { data: old } = await supabase.from("org_slug_history").select("org:orgs(slug)").eq("slug", slug).maybeSingle();
    const now = (old?.org as unknown as { slug: string } | null)?.slug;
    return now ? { movedTo: now } : null;
  }
  const { data: jobs } = await supabase.from("jobs").select("*").eq("org_id", org.id).eq("status", "published")
    .order("published_at", { ascending: false });
  return { org: org as Org, jobs: (jobs ?? []) as Job[] };
}

export type HiringCompany = { name: string; slug: string; logo_url: string | null; jobs: number };

// Companies with live jobs, most jobs first (hiring_companies, 035_jobs_ui.sql). Duplicates count once.
export async function hiringCompanies(limit = 500): Promise<HiringCompany[]> {
  if (!supabaseReady) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hiring_companies", { p_limit: limit });
  if (error) console.error("hiringCompanies", error);
  return (data ?? []).map((c) => ({ ...c, jobs: Number(c.jobs) }));
}

// How many live jobs a search finds, without loading them.
export async function countJobs(f: Partial<Filters>): Promise<number> {
  return (await searchJobs(f, 1, 1)).total;
}

// Under a job: the company's other live jobs, and jobs in the same role (or area) from other companies.
export async function relatedJobs(job: Pick<Job, "id" | "org_id" | "role" | "category" | "dupe_key">): Promise<{ company: Job[]; similar: JobWithOrg[] }> {
  if (!supabaseReady) return { company: [], similar: [] };
  const supabase = await createClient();
  const [{ data: company }, { jobs }] = await Promise.all([
    supabase.from("jobs").select("*").eq("org_id", job.org_id).eq("status", "published").neq("id", job.id)
      .order("published_at", { ascending: false }).limit(4),
    job.role || job.category ? searchJobs(job.role ? { role: job.role } : { category: job.category }, 1, 12) : Promise.resolve({ jobs: [] as JobWithOrg[] }),
  ]);
  const similar = jobs.filter((j) => j.id !== job.id && j.org_id !== job.org_id && (!job.dupe_key || j.dupe_key !== job.dupe_key)).slice(0, 4);
  return { company: (company ?? []) as Job[], similar };
}

export type CardState = { id: string; stage: string };

// The signed-in person's tracker cards for these jobs, so job cards can say Saved or Applied. Only their own cards
// can be read (row rules), and nothing when nobody is signed in.
export async function cardStates(jobIds: string[]): Promise<Record<string, CardState>> {
  if (!supabaseReady || !jobIds.length) return {};
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};
  const { data } = await supabase.from("tracker_items").select("id, stage, job_id").in("job_id", jobIds).order("created_at");
  const out: Record<string, CardState> = {};
  for (const c of data ?? []) if (c.job_id && !out[c.job_id]) out[c.job_id] = { id: c.id, stage: c.stage };
  return out;
}
