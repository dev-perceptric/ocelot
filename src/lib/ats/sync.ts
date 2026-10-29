import "server-only";
import { createAdmin } from "@/lib/supabase/server";
import { detailUrl, feedUrl, parseDetail, parseFeed, type Provider } from "./boards";
import { htmlToText, importedSlug, toJob } from "./normalize";

// Keeps one company's Ocelot jobs in step with its job board. New jobs go live, changed ones update, and jobs
// that left the board close. A board that fails to load changes nothing and records the error.

type Source = { id: string; org_id: string; provider: string; board: string; countries: string[]; niche_only: boolean };
export type SyncResult = { seen: number; imported: number; added: number; updated: number; closed: number };

const TEST_BASE = process.env.ATS_TEST_URL;
const LIVE_DAYS = 30;

async function getJson(url: string, fetchImpl: typeof fetch) {
  const res = await fetchImpl(url, { headers: { Accept: "application/json", "User-Agent": "Ocelot job sync (joinocelot.com)" }, signal: AbortSignal.timeout(20_000) });
  if (res.status === 404) throw new Error("This board wasn't found. Check the link.");
  if (!res.ok) throw new Error(`The board answered ${res.status}. Try again later.`);
  return res.json();
}

export async function syncSource(src: Source, fetchImpl: typeof fetch = fetch): Promise<SyncResult> {
  const db = createAdmin();
  const provider = src.provider as Provider;
  try {
    const raw = parseFeed(provider, await getJson(feedUrl(provider, src.board, TEST_BASE), fetchImpl));
    const picked = raw.flatMap((r) => { const t = toJob(r, src); return "job" in t ? [{ raw: r, job: t.job }] : []; });

    // SmartRecruiters lists jobs without their text: fetch it for the ones that came through.
    for (const p of picked.slice(0, 60)) {
      const url = detailUrl(provider, src.board, p.raw.externalId, TEST_BASE);
      if (!url) break;
      try {
        const d = parseDetail(provider, await getJson(url, fetchImpl));
        if (d.html) p.job.description = htmlToText(d.html).slice(0, 10000);
        if (d.applyUrl) p.job.apply_url = d.applyUrl;
      } catch { /* keep the job without its text */ }
    }

    const [{ data: org }, { data: existing }] = await Promise.all([
      db.from("orgs").select("name").eq("id", src.org_id).single(),
      db.from("jobs").select("id, external_id, status, closed_by_company").eq("source_id", src.id),
    ]);
    const byId = new Map((existing ?? []).map((j) => [j.external_id, j]));
    const live = (existing ?? []).filter((j) => j.status === "published").length;
    // An empty board when we had several live jobs is more likely a hiccup than every job closing at once.
    if (!raw.length && live > 5) throw new Error("The board returned no jobs. Nothing was closed.");

    const now = new Date();
    const until = new Date(now.getTime() + LIVE_DAYS * 86_400_000).toISOString();
    let added = 0, updated = 0, closed = 0;
    for (const { job } of picked) {
      const fields = { ...job, expires_at: until };
      const had = byId.get(job.external_id);
      if (had) {
        const reopen = (had.status === "closed" || had.status === "expired") && !had.closed_by_company;
        const { error } = await db.from("jobs").update({ ...fields, ...(reopen ? { status: "published" } : {}) }).eq("id", had.id);
        if (error) throw error;
        updated++;
      } else {
        const { error } = await db.from("jobs").insert({
          ...fields, org_id: src.org_id, source: "ats", source_id: src.id, apply_method: "external",
          slug: importedSlug(job.title, org?.name ?? "", `${src.provider}:${src.board}:${job.external_id}`),
          status: "published", published_at: now.toISOString(),
        });
        if (error) throw error;
        added++;
      }
    }
    const keep = new Set(picked.map((p) => p.job.external_id));
    const gone = (existing ?? []).filter((j) => j.status === "published" && !keep.has(j.external_id ?? "")).map((j) => j.id);
    if (gone.length) {
      const { error } = await db.from("jobs").update({ status: "closed" }).in("id", gone);
      if (error) throw error;
      closed = gone.length;
    }
    await db.from("job_sources").update({ last_synced_at: now.toISOString(), last_error: null, last_seen: raw.length, last_imported: picked.length }).eq("id", src.id);
    return { seen: raw.length, imported: picked.length, added, updated, closed };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from("job_sources").update({ last_synced_at: new Date().toISOString(), last_error: message.slice(0, 300) }).eq("id", src.id);
    throw new Error(message);
  }
}

export async function runSources(): Promise<number> {
  const { data: due, error } = await createAdmin().rpc("due_sources", { p_limit: 5 });
  if (error) throw error;
  let ok = 0;
  for (const s of due ?? []) {
    try { await syncSource(s); ok++; } catch (e) { console.error(`sync ${s.provider}/${s.board} failed`, e); }
  }
  return ok;
}
