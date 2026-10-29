import "server-only";
import { supabaseReady } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Job, Org } from "@/lib/jobs";
import type { Filters } from "@/lib/search";

export type JobWithOrg = Job & { org: Pick<Org, "name" | "slug" | "logo_url"> };

export const PAGE_SIZE = 20;

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
      company: f.company ?? undefined,
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
