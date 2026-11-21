import "server-only";
import { unstable_cache } from "next/cache";
import { supabaseReady } from "@/lib/env";
import { createClient, createVisitor } from "@/lib/supabase/server";
import type { AgencyLabel, Job, Org } from "@/lib/jobs";
import type { Filters } from "@/lib/search";

export type JobWithOrg = Job & { org: Pick<Org, "name" | "slug" | "logo_url"> & { agency?: AgencyLabel | null } };
export type SearchInput = Partial<Filters> & { company?: string; agency?: string };

export const PAGE_SIZE = 50;

// The columns a job list needs: everything but the description (cards don't show it; the panel and job page load it).
const LIST_COLUMNS = "id, org_id, slug, title, dupe_key, category, seniority, employment_type, workplace, office_places, role, " +
  "eligible_countries, time_zones, salary_min, salary_max, salary_currency, salary_period, apply_method, apply_url, status, " +
  "featured_until, published_at, expires_at, org:orgs(name, slug, logo_url, agency:agencies(name, slug))";

// Job search through search_jobs and search_jobs_count (supabase/migrations/036_search_speed.sql): only live jobs
// from companies that aren't suspended, one copy of each, promoted first, then taking turns between companies. Every visitor sees the
// same results, so each search and page is kept for 5 minutes and shared: most visits, crawlers included, never reach
// the database. A database hiccup shows an empty list instead of an error page, and isn't kept.
const cachedSearch = unstable_cache(async (key: string): Promise<{ jobs: JobWithOrg[]; total: number }> => {
  const { f, page, size } = JSON.parse(key) as { f: SearchInput; page: number; size: number };
  const filters = {
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
    company: f.company ?? undefined,
    no_agency: f.noAgency || undefined,
    agency: f.agency ?? undefined,
    industry: f.industry ?? undefined,
  };
  const db = createVisitor();
  // The page and the total are separate calls: the database sorts only to find the page, and counts without sorting.
  const [list, counted] = await Promise.all([
    db.rpc("search_jobs", { ...filters, sort: f.sort ?? "best", p_limit: size, p_offset: (page - 1) * size }).select(LIST_COLUMNS),
    db.rpc("search_jobs_count", filters),
  ]);
  if (list.error) throw new Error(`searchJobs: ${list.error.message}`);
  if (counted.error) throw new Error(`searchJobs count: ${counted.error.message}`);
  const jobs = ((list.data ?? []) as unknown as Omit<JobWithOrg, "description">[]).map((j) => ({ ...j, description: "" }) as JobWithOrg);
  return { jobs, total: Number(counted.data ?? 0) };
}, ["search-jobs-v4"], { revalidate: 300 });

// company (a company slug) keeps to one company: the company pages by area. agency (an agency slug) keeps to its
// clients: the agency page.
export async function searchJobs(f: SearchInput = {}, page = 1, size = PAGE_SIZE): Promise<{ jobs: JobWithOrg[]; total: number }> {
  if (!supabaseReady) return { jobs: [], total: 0 };
  // The same search always makes the same key, whatever order the filters came in.
  const clean = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== false && !(Array.isArray(v) && !v.length)).sort(([a], [b]) => a.localeCompare(b)));
  try {
    return await cachedSearch(JSON.stringify({ f: clean, page, size }));
  } catch (e) {
    console.error(e);
    return { jobs: [], total: 0 };
  }
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
    .select("*, org:orgs(*, agency:agencies(name, slug)), job_questions(prompt, position)").eq("slug", slug).maybeSingle();
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
  const { data: org } = await supabase.from("orgs").select("*, agency:agencies(name, slug)").eq("slug", slug).maybeSingle();
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

// Companies with live jobs, most jobs first (hiring_companies, 036_search_speed.sql), kept for 10 minutes. Read a
// thousand at a time (the API's page size), so the list doesn't stop at 1,000.
const cachedCompanies = unstable_cache(async (): Promise<HiringCompany[]> => {
  const out: HiringCompany[] = [];
  for (let from = 0; from < 5000; from += 1000) {
    const { data, error } = await createVisitor().rpc("hiring_companies", { p_limit: 5000 }).range(from, from + 999);
    if (error) throw new Error(`hiringCompanies: ${error.message}`);
    out.push(...(data ?? []).map((c) => ({ ...c, jobs: Number(c.jobs) })));
    if (!data || data.length < 1000) break;
  }
  return out;
}, ["hiring-companies-v2"], { revalidate: 600 });

export async function hiringCompanies(limit = 5000): Promise<HiringCompany[]> {
  if (!supabaseReady) return [];
  try {
    return (await cachedCompanies()).slice(0, limit);
  } catch (e) {
    console.error(e);
    return [];
  }
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

export type PublicAgency = { id: string; name: string; slug: string; logo_url: string | null; website: string | null; about: string | null; business_verified_at: string | null };

// An agency's public page: the agency (visible while a client has a public job and it isn't suspended) and its
// clients' live jobs.
export async function getAgency(slug: string): Promise<{ agency: PublicAgency; jobs: JobWithOrg[]; total: number } | null> {
  if (!supabaseReady) return null;
  const { data: agency } = await createVisitor().from("agencies")
    .select("id, name, slug, logo_url, website, about, business_verified_at").eq("slug", slug).maybeSingle();
  if (!agency) return null;
  const { jobs, total } = await searchJobs({ agency: slug, sort: "new" }, 1, PAGE_SIZE);
  return { agency, jobs, total };
}

// Agencies with live jobs, for the sitemap.
export async function hiringAgencies(): Promise<{ name: string; slug: string; jobs: number }[]> {
  if (!supabaseReady) return [];
  const { data, error } = await createVisitor().rpc("hiring_agencies");
  if (error) console.error("hiringAgencies", error);
  return (data ?? []).map((a) => ({ ...a, jobs: Number(a.jobs) }));
}
