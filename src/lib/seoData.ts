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

// The counts as a lookup, built once per hourly list rather than on every question.
let lookup: { from: [string, number][]; map: Map<string, number> } | null = null;
async function counts(): Promise<Map<string, number> | null> {
  let list: [string, number][];
  try { list = await cachedCounts(); } catch (e) { console.error(e); return null; }
  if (!list.length) return null;
  if (lookup?.from !== list) lookup = { from: list, map: new Map(list) };
  return lookup.map;
}

const areaKey = (f: Filters) => (f.role ? `r:${f.role}` : f.category ? `c:${f.category}` : "all");

// Jobs on a role and place page (0 when under 3). A state's page has its offices plus remote jobs open to its whole
// country.
export async function pageJobs(f: Filters): Promise<number | null> {
  const m = await counts();
  if (!m) return null;
  const a = areaKey(f);
  const x = extraOf(f) ?? "";
  const remote = f.where.includes("remote");
  const get = (place: string) => m.get(`${a}|${place}|${x}`) ?? 0;
  if (remote) return f.country || f.region || f.city ? null : get("remote");
  if (f.city) return get(`city:${f.city}`);
  if (f.region) return get(`region:${f.region}`) + get(`remote-in:${f.region.slice(0, 2)}`);
  if (f.country) return get(`country:${f.country}`);
  return get("all");
}

// The fewest live jobs a page needs to be listed for search engines (in the sitemap, linked, and not marked noindex).
// Pages with an extra filter are narrower, so they need more.
export const MIN_JOBS = 3;
export const MIN_JOBS_EXTRA = 5;
export const minJobs = (f: Filters) => (extraOf(f) ? MIN_JOBS_EXTRA : MIN_JOBS);

export type SeoLink = { href: string; jobs: number; f: Filters };

// Every role and place page with enough live jobs to be listed (minJobs), biggest first. Kept per hourly count list.
let pagesMemo: { from: Map<string, number>; pages: SeoLink[] } | null = null;
export async function seoPages(): Promise<SeoLink[]> {
  const m = await counts();
  if (!m) return [];
  if (pagesMemo?.from === m) return pagesMemo.pages;
  const out: SeoLink[] = [];
  const areas = [null, ...AREAS];
  for (const area of areas) {
    const base = { category: area?.category ?? undefined, role: area?.role ?? undefined };
    const shapes = [
      ...(area ? [readFilters(base)] : []),
      readFilters({ ...base, where: "remote" }),
      ...PLACES.map((p) => readFilters({ ...base, country: p.country ?? undefined, region: p.region ?? undefined, city: p.city ?? undefined })),
    ];
    for (const shape of shapes) {
      for (const f of [shape, ...EXTRAS.map((e) => ({ ...shape, ...e.set }))]) {
        const href = seoPath(f);
        const jobs = href ? await pageJobs(f) : null;
        if (href && jobs !== null && jobs >= minJobs(f)) out.push({ href, jobs, f });
      }
    }
  }
  pagesMemo = { from: m, pages: out.sort((x, y) => y.jobs - x.jobs) };
  return pagesMemo.pages;
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

export async function pageSummary(f: Filters, company?: string): Promise<PageSummary | null> {
  if (!supabaseReady) return null;
  try { return await cachedSummary(JSON.stringify({ ...f, company })); } catch (e) { console.error(e); return null; }
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
