import "server-only";
import { supabaseReady } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Job, Org } from "@/lib/jobs";

export type JobWithOrg = Job & { org: Pick<Org, "name" | "slug"> };

const JOB_FIELDS = "*, org:orgs(name, slug)";

// Live jobs, newest first. Row level security already limits visitors to published jobs; the status filter
// keeps employers from seeing their own drafts in the public list.
export async function listJobs({ q, workplace, category, limit = 50 }: {
  q?: string; workplace?: string; category?: string; limit?: number;
} = {}): Promise<JobWithOrg[]> {
  if (!supabaseReady) return [];
  const supabase = await createClient();
  let query = supabase.from("jobs").select(JOB_FIELDS).eq("status", "published")
    .order("published_at", { ascending: false }).limit(limit);
  if (q?.trim()) query = query.textSearch("search", q.trim(), { type: "websearch", config: "simple" });
  if (workplace) query = query.eq("workplace", workplace);
  if (category) query = query.eq("category", category);
  // A database hiccup shows an empty list instead of an error page on the home page and sitemap.
  const { data, error } = await query;
  if (error) console.error("listJobs", error);
  return (data ?? []) as JobWithOrg[];
}

export async function getJob(slug: string): Promise<(Job & { org: Org }) | null> {
  if (!supabaseReady) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("jobs").select("*, org:orgs(*)").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data as (Job & { org: Org }) | null;
}

export async function getOrg(slug: string): Promise<{ org: Org; jobs: Job[] } | null> {
  if (!supabaseReady) return null;
  const supabase = await createClient();
  const { data: org } = await supabase.from("orgs").select("*").eq("slug", slug).maybeSingle();
  if (!org) return null;
  const { data: jobs } = await supabase.from("jobs").select("*").eq("org_id", org.id).eq("status", "published")
    .order("published_at", { ascending: false });
  return { org: org as Org, jobs: (jobs ?? []) as Job[] };
}
