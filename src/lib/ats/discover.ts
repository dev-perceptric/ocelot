import "server-only";
import { slugify } from "@/lib/jobs";
import { createAdmin } from "@/lib/supabase/server";
import { PROVIDERS, type Provider } from "./boards";
import { toJob } from "./normalize";
import { loadBoard, syncSource } from "./sync";

// Looks for companies' job boards by itself. Each name on the list is tried on every board type (or its known
// board) once a week; a board with jobs that pass the default filters becomes a source and syncs at once.

const DEFAULT = { countries: ["US", "CA"], niche_only: true };
const ORDER: Provider[] = ["greenhouse", "lever", "ashby", "smartrecruiters", "recruitee", "workable"];

type Candidate = { slug: string; name: string; provider: string | null; board: string | null };

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
      const { jobs, company } = await loadBoard(p, b, fetchImpl);
      if (!jobs.length) continue;
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
  const org = await companyFor(found.company ?? c.name);
  const { data: src, error } = await db.from("job_sources").insert({ org_id: org, provider: found.provider, board: found.board, ...DEFAULT }).select("*").single();
  if (error || !src) return false;
  await db.from("board_candidates").update({ source_id: src.id }).eq("slug", c.slug);
  try { await syncSource(src, fetchImpl); } catch (e) { console.error(`first sync ${PROVIDERS[found.provider].name} ${found.board} failed`, e); }
  return true;
}

// One hourly run: up to 400 names, eight at a time, for at most 3 minutes (it runs after the hourly call answers).
export async function runDiscovery(fetchImpl: typeof fetch = fetch, budgetMs = 180_000): Promise<number> {
  const { data: due, error } = await createAdmin().rpc("due_candidates", { p_limit: 400 });
  if (error) throw error;
  const queue = [...(due ?? [])];
  const stopAt = Date.now() + budgetMs;
  let added = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (queue.length && Date.now() < stopAt) {
      const c = queue.shift()!;
      try { if (await check(c, fetchImpl)) added++; } catch (e) { console.error(`discovery ${c.slug} failed`, e); }
    }
  }));
  return added;
}
