import "server-only";
import { slugify } from "@/lib/jobs";
import { createAdmin } from "@/lib/supabase/server";
import { PROVIDERS, type Provider } from "./boards";
import { cleanCompanyName, sameCompany } from "./names";
import { toJob } from "./normalize";
import { loadBoard, ourTitle, syncSource } from "./sync";

// Looks for companies' job boards by itself. Each name on the list is tried on every board type whose address is
// the company's name (or its known board) once a week; a board with jobs that pass the default filters becomes a
// source and syncs at once. Boards found in the public web crawl (found_by "crawl") are checked once a month.

const DEFAULT = { countries: ["US", "CA"], niche_only: true };
const ORDER: Provider[] = ["greenhouse", "lever", "ashby", "smartrecruiters", "recruitee", "workable", "bamboohr", "breezy", "rippling", "pinpoint", "teamtailor", "jazzhr"];

type Candidate = { slug: string; name: string; provider: string | null; board: string | null; found_by?: string };

// Finds or makes the company for a board: an existing company with the same name, or a new one.
async function companyFor(name: string): Promise<string> {
  const db = createAdmin();
  const { data: same } = await db.from("orgs").select("id").ilike("name", name.replace(/[%_\\]/g, "\\$&")).limit(1).maybeSingle();
  if (same) return same.id;
  const base = slugify(name) || "company";
  const { data: taken } = await db.from("orgs").select("slug").like("slug", `${base}%`);
  const used = new Set((taken ?? []).map((t) => t.slug));
  let slug = base;
  for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;
  const { data, error } = await db.from("orgs").insert({ name: name.slice(0, 120), slug }).select("id").single();
  if (error || !data) throw error ?? new Error("company not saved");
  return data.id;
}

async function check(c: Candidate, fetchImpl: typeof fetch): Promise<boolean> {
  const db = createAdmin();
  const tries: [Provider, string][] = c.provider && c.board ? [[c.provider as Provider, c.board]]
    : ORDER.flatMap((p) => (p === "smartrecruiters" ? [[p, c.slug], [p, c.slug[0].toUpperCase() + c.slug.slice(1)]] : [[p, c.slug]]) as [Provider, string][]);
  let found: { provider: Provider; board: string; company: string | null } | null = null;
  for (const [p, b] of tries) {
    try {
      const { jobs, company } = await loadBoard(p, b, fetchImpl, ourTitle);
      if (!jobs.length) continue;
      // A board under this name that belongs to someone else ("wise" is Wise Benefits): keep looking. A board
      // found in the crawl is its own company.
      if (c.found_by !== "crawl" && company && !sameCompany(c.name, cleanCompanyName(company))) continue;
      // Remember the board, so next week's check is one request.
      await db.from("board_candidates").update({ provider: p, board: b }).eq("slug", c.slug);
      if (jobs.some((j) => "job" in toJob(j, DEFAULT))) found = { provider: p, board: b, company };
      break;
    } catch { /* no board here */ }
  }
  await db.from("board_candidates").update({ checked_at: new Date().toISOString() }).eq("slug", c.slug);
  if (!found) return false;

  const { data: had } = await db.from("job_sources").select("id").eq("provider", found.provider).ilike("board", found.board).maybeSingle();
  if (had) {
    await db.from("board_candidates").update({ source_id: had.id }).eq("slug", c.slug);
    return false;
  }
  const org = await companyFor(cleanCompanyName(found.company ?? c.name));
  const { data: src, error } = await db.from("job_sources")
    .insert({ org_id: org, provider: found.provider, board: found.board, ...DEFAULT, sync_hours: c.found_by === "crawl" ? 24 : 6 }).select("*").single();
  if (error || !src) return false;
  await db.from("board_candidates").update({ source_id: src.id }).eq("slug", c.slug);
  try { await syncSource(src, fetchImpl); } catch (e) { console.error(`first sync ${PROVIDERS[found.provider].name} ${found.board} failed`, e); }
  return true;
}

// One hourly run: up to 1,000 names or boards, ten at a time, for at most 4 minutes (after the hourly call answers).
export async function runDiscovery(fetchImpl: typeof fetch = fetch, budgetMs = 240_000): Promise<number> {
  const db = createAdmin();
  // Imported jobs at the cap: no new boards this hour (the boards already added keep syncing).
  const [{ data: settings }, { count }] = await Promise.all([
    db.from("app_settings").select("max_imported_jobs").eq("id", true).single(),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("source", "ats").eq("status", "published"),
  ]);
  if ((count ?? 0) >= (settings?.max_imported_jobs ?? 15000)) return 0;
  const { data: due, error } = await db.rpc("due_candidates", { p_limit: 1000 });
  if (error) throw error;
  const queue = [...(due ?? [])];
  const stopAt = Date.now() + budgetMs;
  let added = 0;
  await Promise.all(Array.from({ length: 10 }, async () => {
    while (queue.length && Date.now() < stopAt) {
      const c = queue.shift()!;
      try { if (await check(c, fetchImpl)) added++; } catch (e) { console.error(`discovery ${c.slug} failed`, e); }
    }
  }));
  return added;
}
