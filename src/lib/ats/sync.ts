import "server-only";
import { createHash } from "node:crypto";
import { createAdmin } from "@/lib/supabase/server";
import { detailUrl, feedCompany, feedUrl, isClassic, nextPageUrl, parseDetail, parseFeed, type Provider, type RawJob } from "./boards";
import { guessRole, htmlToText, importedSlug, toJob } from "./normalize";
import { READERS, type Get } from "./readers";

// Keeps one company's Ocelot jobs in step with its job board. New jobs go live, changed ones update, and jobs
// that left the board close. A board that fails to load changes nothing and records the error.

type Source = { id: string; org_id: string; provider: string; board: string; countries: string[]; niche_only: boolean };
export type SyncResult = { seen: number; imported: number; added: number; updated: number; closed: number };

const TEST_BASE = process.env.ATS_TEST_URL;
const LIVE_DAYS = 30;

export async function getJson(url: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(url, { headers: { Accept: "application/json", "User-Agent": "Ocelot job sync (joinocelot.com)" }, signal: AbortSignal.timeout(20_000) });
  if (res.status === 404) throw new Error("This board wasn't found. Check the link.");
  if (!res.ok) throw new Error(`The board answered ${res.status}. Try again later.`);
  return res.json();
}

// Boards read through several calls. Tests send every address to the local stand-in (/web/<host>/<path>).
function getter(fetchImpl: typeof fetch): Get {
  return async (url, init) => {
    const u = new URL(url);
    const res = await fetchImpl(TEST_BASE ? `${TEST_BASE.replace(/\/$/, "")}/web/${u.host}${u.pathname}${u.search}` : url, {
      method: init?.post ? "POST" : "GET",
      body: init?.post ? JSON.stringify(init.post) : undefined,
      headers: { Accept: init?.text ? "text/html,application/xml,*/*" : "application/json", "User-Agent": "Ocelot job sync (joinocelot.com)", ...(init?.post ? { "Content-Type": "application/json" } : {}) },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 404) throw new Error("This board wasn't found. Check the link.");
    if (!res.ok) throw new Error(`The board answered ${res.status}. Try again later.`);
    return init?.text ? res.text() : res.json();
  };
}

// Titles Ocelot imports: marketing, sales and customer success, unless a board takes every role.
export const ourTitle = (title: string) => Boolean(guessRole(title).category);

// Every job on a board, following its pages, plus the company name when the feed gives one. Boards read through
// several calls only open the jobs whose title is `wanted`.
export async function loadBoard(provider: Provider, board: string, fetchImpl: typeof fetch = fetch, wanted: (title: string) => boolean = () => true): Promise<{ jobs: RawJob[]; company: string | null }> {
  if (!isClassic(provider)) return READERS[provider](board, { get: getter(fetchImpl), wanted });
  let url: string | null = feedUrl(provider, board, TEST_BASE);
  const jobs: RawJob[] = [];
  let company: string | null = null;
  for (let page = 0; url && page < 10; page++) {
    const json = await getJson(url, fetchImpl);
    if (page === 0) company = feedCompany(provider, json);
    jobs.push(...parseFeed(provider, json));
    url = nextPageUrl(provider, board, json, TEST_BASE);
  }
  return { jobs, company };
}

export async function syncSource(src: Source, fetchImpl: typeof fetch = fetch): Promise<SyncResult> {
  const db = createAdmin();
  const provider = src.provider as Provider;
  try {
    const raw = (await loadBoard(provider, src.board, fetchImpl, src.niche_only ? ourTitle : () => true)).jobs;
    // Some boards list one job once per location under the same id: keep the first.
    const ids = new Set<string>();
    const picked = raw.flatMap((r) => {
      const t = toJob(r, src);
      if (!("job" in t) || ids.has(t.job.external_id)) return [];
      ids.add(t.job.external_id);
      return [{ raw: r, job: t.job }];
    });

    // SmartRecruiters lists jobs without their text: fetch it for the ones that came through.
    for (const p of isClassic(provider) ? picked.slice(0, 60) : []) {
      if (!isClassic(provider)) break;
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
      db.from("jobs").select("id, external_id, status, closed_by_company, source_hash, expires_at").eq("source_id", src.id),
    ]);
    const byId = new Map((existing ?? []).map((j) => [j.external_id, j]));
    const live = (existing ?? []).filter((j) => j.status === "published").length;
    // An empty board when we had several live jobs is more likely a hiccup than every job closing at once.
    if (!raw.length && live > 5) throw new Error("The board returned no jobs. Nothing was closed.");

    // Each request to the database is logged, and the logs count toward the plan: write only what changed. A job's
    // fingerprint says whether the board changed it; new jobs go in one batch; the 30 days are topped up in one go.
    const now = new Date();
    const until = new Date(now.getTime() + LIVE_DAYS * 86_400_000).toISOString();
    const soon = now.getTime() + (LIVE_DAYS - 10) * 86_400_000;
    const fingerprint = (job: object) => createHash("sha1").update(JSON.stringify(job)).digest("hex");
    let added = 0, updated = 0, closed = 0;
    const fresh: { job: (typeof picked)[number]["job"]; hash: string; slug: string }[] = [];
    for (const { job } of picked) {
      const hash = fingerprint(job);
      const had = byId.get(job.external_id);
      if (had) {
        const reopen = (had.status === "closed" || had.status === "expired") && !had.closed_by_company;
        if (had.source_hash === hash && !reopen) continue;
        const { error } = await db.from("jobs").update({ ...job, source_hash: hash, expires_at: until, ...(reopen ? { status: "published" } : {}) }).eq("id", had.id);
        if (error) throw error;
        updated++;
      } else {
        fresh.push({ job, hash, slug: importedSlug(job.title, org?.name ?? "", `${src.provider}:${src.board}:${job.external_id}`) });
      }
    }
    if (fresh.length) {
      // A board that was deleted and added again takes back its old jobs (same board, same job, same address).
      const { data: olds } = await db.from("jobs").select("id, slug, closed_by_company").eq("org_id", src.org_id).is("source_id", null).in("slug", fresh.map((f) => f.slug));
      const oldBySlug = new Map((olds ?? []).map((o) => [o.slug, o]));
      for (const f of fresh.filter((f) => oldBySlug.has(f.slug))) {
        const old = oldBySlug.get(f.slug)!;
        const { error } = await db.from("jobs").update({ ...f.job, source_hash: f.hash, expires_at: until, source_id: src.id, ...(old.closed_by_company ? {} : { status: "published" }) }).eq("id", old.id);
        if (error) throw error;
        updated++;
      }
      const rows = fresh.filter((f) => !oldBySlug.has(f.slug)).map((f) => ({
        ...f.job, source_hash: f.hash, expires_at: until, org_id: src.org_id, source: "ats", source_id: src.id, apply_method: "external",
        slug: f.slug, status: "published", published_at: now.toISOString(),
      }));
      if (rows.length) {
        const { error } = await db.from("jobs").insert(rows);
        if (error) throw error;
        added = rows.length;
      }
    }
    // Live jobs still on the board stay live another 30 days; topped up when fewer than 20 are left.
    if ((existing ?? []).some((j) => j.status === "published" && j.expires_at && new Date(j.expires_at).getTime() < soon)) {
      const { error } = await db.from("jobs").update({ expires_at: until }).eq("source_id", src.id).eq("status", "published").lt("expires_at", new Date(soon).toISOString());
      if (error) throw error;
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
    // Database errors arrive as plain objects with a message, not as Error.
    const message = e instanceof Error ? e.message : typeof (e as { message?: unknown })?.message === "string" ? (e as { message: string }).message : String(e);
    await db.from("job_sources").update({ last_synced_at: new Date().toISOString(), last_error: message.slice(0, 300) }).eq("id", src.id);
    throw new Error(message);
  }
}

// One hourly run: boards due a sync, six at a time, for at most 4 minutes.
export async function runSources(budgetMs = 240_000): Promise<number> {
  const { data: due, error } = await createAdmin().rpc("due_sources", { p_limit: 400 });
  if (error) throw error;
  const queue = [...(due ?? [])];
  const stopAt = Date.now() + budgetMs;
  let ok = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length && Date.now() < stopAt) {
      const s = queue.shift()!;
      try { await syncSource(s); ok++; } catch (e) { console.error(`sync ${s.provider}/${s.board} failed`, e); }
    }
  }));
  return ok;
}
