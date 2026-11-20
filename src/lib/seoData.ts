import "server-only";
import { unstable_cache } from "next/cache";
import { supabaseReady } from "@/lib/env";
import { AREAS, EXTRAS, extraOf, PLACES, seoPath } from "@/lib/seo";
import { readFilters, type Filters } from "@/lib/search";
import { createVisitor } from "@/lib/supabase/server";

// Live job counts by area, place and extra (037_seo_more.sql), shared by everyone and kept for an hour. Only counts of
// 3 or more are read (no page below that is listed anywhere). A failed read isn't kept: pages show without counts and
// links until the next one works.
const cachedCounts = unstable_cache(async (): Promise<[string, number][]> => {
  if (!supabaseReady) return [];
  // A thousand rows at a time: the API's page size.
  const out: [string, number][] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await createVisitor().from("seo_page_counts").select("area, place, extra, jobs").gte("jobs", 3)
      .order("area").order("place").order("extra").range(from, from + 999);
    if (error) throw new Error(`seo_counts: ${error.message}`);
    out.push(...(data ?? []).map((r): [string, number] => [`${r.area}|${r.place}|${r.extra}`, r.jobs]));
    if (!data || data.length < 1000) break;
  }
  return out;
}, ["seo-counts-v2"], { revalidate: 3600 });

// The counts as a lookup. The data cache hands back a fresh copy on every read, so the lookup is kept in memory for
// 5 minutes instead of being rebuilt per question.
const MEMO_MS = 5 * 60_000;
let lookup: { at: number; map: Map<string, number> | null } | null = null;
async function counts(): Promise<Map<string, number> | null> {
  if (lookup && Date.now() - lookup.at < MEMO_MS) return lookup.map;
  let list: [string, number][];
  try { list = await cachedCounts(); } catch (e) { console.error(e); return null; }
  lookup = { at: Date.now(), map: list.length ? new Map(list) : null };
  return lookup.map;
}

const areaKey = (f: Filters) => (f.role ? `r:${f.role}` : f.category ? `c:${f.category}` : "all");

function jobsIn(m: Map<string, number>, f: Filters): number | null {
  const a = areaKey(f);
  const x = extraOf(f) ?? "";
  const get = (place: string) => m.get(`${a}|${place}|${x}`) ?? 0;
  if (f.where.includes("remote")) return f.country || f.region || f.city ? null : get("remote");
  if (f.city) return get(`city:${f.city}`);
  if (f.region) return get(`region:${f.region}`) + get(`remote-in:${f.region.slice(0, 2)}`);
  if (f.country) return get(`country:${f.country}`);
  return get("all");
}

// Jobs on a role and place page (0 when under 3). A state's page has its offices plus remote jobs open to its whole
// country.
export async function pageJobs(f: Filters): Promise<number | null> {
  const m = await counts();
  return m ? jobsIn(m, f) : null;
}

// The fewest live jobs a page needs to be listed for search engines (in the sitemap, linked, and not marked noindex).
// Pages with an extra filter are narrower, so they need more.
export const MIN_JOBS = 3;
export const MIN_JOBS_EXTRA = 5;
export const minJobs = (f: Filters) => (extraOf(f) ? MIN_JOBS_EXTRA : MIN_JOBS);

export type SeoLink = { href: string; jobs: number; f: Filters };

const EMPTY_FILTERS = readFilters({});
const REGION_CODES = PLACES.filter((p) => p.region).map((p) => p.region!);
const EXTRA_SET = new Map(EXTRAS.map((e) => [e.key, e.set]));

// The search a counts row stands for: area 'all' | 'c:sales' | 'r:account_executive'; place 'all' | 'country:US' |
// 'region:US-TX' | 'city:austin' | 'remote'; extra '' | 'level:senior' ... ('remote-in:' rows only add to states).
function filtersFor(area: string, place: string, extra: string): Filters | null {
  if (place.startsWith("remote-in:")) return null;
  const set = extra ? EXTRA_SET.get(extra) : {};
  if (!set) return null;
  const f: Filters = { ...EMPTY_FILTERS, ...set };
  if (area.startsWith("r:")) {
    const r = AREAS.find((x) => x.role === area.slice(2));
    if (!r) return null;
    f.role = r.role; f.category = r.category;
  } else if (area.startsWith("c:")) f.category = area.slice(2);
  if (place === "remote") f.where = [...f.where, "remote"];
  else if (place.startsWith("country:")) f.country = place.slice(8);
  else if (place.startsWith("region:")) f.region = place.slice(7);
  else if (place.startsWith("city:")) f.city = place.slice(5);
  else if (place !== "all") return null;
  return f;
}

// Every role and place page with enough live jobs to be listed (minJobs), biggest first. Built from the counts that
// exist (only pages with 3 or more jobs are read), so it takes a few thousand steps, once an hour; kept in the data
// cache and in memory.
function buildPages(m: Map<string, number>): SeoLink[] {
  const out = new Map<string, SeoLink>();
  const consider = (f: Filters | null) => {
    if (!f) return;
    const href = seoPath(f);
    if (!href || out.has(href)) return;
    const jobs = jobsIn(m, f);
    if (jobs !== null && jobs >= minJobs(f)) out.set(href, { href, jobs, f });
  };
  for (const key of m.keys()) {
    const [area, place, extra = ""] = key.split("|");
    // Remote jobs open to a whole country also count on each of its states' pages.
    if (place.startsWith("remote-in:")) {
      const cc = place.slice(10);
      for (const r of REGION_CODES) if (r.startsWith(`${cc}-`)) consider(filtersFor(area, `region:${r}`, extra));
    } else consider(filtersFor(area, place, extra));
  }
  return [...out.values()].sort((x, y) => y.jobs - x.jobs);
}

const cachedPages = unstable_cache(async (): Promise<SeoLink[]> => {
  const m = await counts();
  return m ? buildPages(m) : [];
}, ["seo-pages-v1"], { revalidate: 3600 });

let pagesMemo: { at: number; pages: SeoLink[] } | null = null;
export async function seoPages(): Promise<SeoLink[]> {
  if (pagesMemo && Date.now() - pagesMemo.at < MEMO_MS) return pagesMemo.pages;
  let pages: SeoLink[];
  try { pages = await cachedPages(); } catch (e) { console.error(e); return pagesMemo?.pages ?? []; }
  pagesMemo = { at: Date.now(), pages };
  return pages;
}

export type PageSummary = {
  jobs: number; remote: number; companies: number;
  top: { name: string; slug: string; jobs: number }[];
  pay_currency: string | null; pay_low: number | null; pay_high: number | null; pay_listed: number;
};

// What a page says about its jobs beyond the list (search_summary, 037_seo_more.sql), kept 6 hours per page: these
// numbers move slowly, and thousands of pages are crawled.
const cachedSummary = unstable_cache(async (key: string): Promise<PageSummary | null> => {
  const f = JSON.parse(key) as Filters & { company?: string };
  const { data, error } = await createVisitor().rpc("search_summary", {
    workplaces: f.where.length ? f.where : undefined, country: f.country ?? undefined, city: f.city ?? undefined,
    region: f.region ?? undefined, category: f.category ?? undefined, role: f.role ?? undefined,
    seniorities: f.level.length ? f.level : undefined, types: f.type.length ? f.type : undefined,
    min_pay: f.minPay ?? undefined, company: f.company ?? undefined,
  });
  if (error) throw new Error(`search_summary: ${error.message}`);
  return (data as PageSummary | null) ?? null;
}, ["page-summary-v1"], { revalidate: 21_600 });

// A failed read isn't kept, so after one the page goes without its numbers for 10 minutes instead of asking again on
// every view while the database is slow.
const summaryFailed = new Map<string, number>();
export async function pageSummary(f: Filters, company?: string): Promise<PageSummary | null> {
  if (!supabaseReady) return null;
  const key = JSON.stringify({ ...f, company });
  const failedAt = summaryFailed.get(key);
  if (failedAt && Date.now() - failedAt < 10 * 60_000) return null;
  try {
    return await cachedSummary(key);
  } catch (e) {
    console.error(e);
    if (summaryFailed.size > 5000) summaryFailed.clear();
    summaryFailed.set(key, Date.now());
    return null;
  }
}

// Live jobs by company and area (3 or more), for company pages by area, kept for an hour.
export type CompanyArea = { slug: string; name: string; area: string; jobs: number };
const cachedCompanyAreas = unstable_cache(async (): Promise<CompanyArea[]> => {
  const out: CompanyArea[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await createVisitor().rpc("company_area_counts").range(from, from + 999);
    if (error) throw new Error(`company_area_counts: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}, ["company-area-counts-v2"], { revalidate: 3600 });

export async function companyAreas(): Promise<CompanyArea[]> {
  if (!supabaseReady) return [];
  try { return await cachedCompanyAreas(); } catch (e) { console.error(e); return []; }
}

// Live jobs for the sitemap, a thousand at a time (the API's page size), kept for an hour.
export const sitemapJobs = unstable_cache(async (): Promise<{ slug: string; published_at: string | null }[]> => {
  if (!supabaseReady) return [];
  const db = createVisitor();
  const out: { slug: string; published_at: string | null }[] = [];
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await db.rpc("sitemap_jobs").range(from, from + 999);
    // Thrown, so a half-read list isn't kept: the sitemap answers with an error and search engines try again.
    if (error) throw new Error(`sitemap_jobs: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}, ["sitemap-jobs"], { revalidate: 3600 });
