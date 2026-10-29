import "server-only";
import { unstable_cache } from "next/cache";
import { supabaseReady } from "@/lib/env";
import { AREAS, PLACES, seoPath } from "@/lib/seo";
import { readFilters, type Filters } from "@/lib/search";
import { createVisitor } from "@/lib/supabase/server";

// Live job counts by area and place (031_seo_pages.sql), shared by everyone and kept for an hour. A failed read
// isn't kept: pages show without counts and links until the next one works.
const cachedCounts = unstable_cache(async (): Promise<[string, number][]> => {
  if (!supabaseReady) return [];
  // A thousand rows at a time: the API's page size.
  const out: [string, number][] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await createVisitor().from("seo_page_counts").select("area, place, jobs").order("area").order("place").range(from, from + 999);
    if (error) throw new Error(`seo_counts: ${error.message}`);
    out.push(...(data ?? []).map((r): [string, number] => [`${r.area}|${r.place}`, r.jobs]));
    if (!data || data.length < 1000) break;
  }
  return out;
}, ["seo-counts"], { revalidate: 3600 });
async function counts(): Promise<[string, number][]> {
  try { return await cachedCounts(); } catch (e) { console.error(e); return []; }
}

const areaKey = (f: Filters) => (f.role ? `r:${f.role}` : f.category ? `c:${f.category}` : "all");

// Jobs on a role and place page. A state's page has its offices plus remote jobs open to its whole country.
export async function pageJobs(f: Filters): Promise<number | null> {
  const all = await counts();
  if (!all.length) return null;
  const m = new Map(all);
  const a = areaKey(f);
  const remote = f.where.length === 1 && f.where[0] === "remote";
  if (remote) return f.country || f.region || f.city ? null : m.get(`${a}|remote`) ?? 0;
  if (f.city) return m.get(`${a}|city:${f.city}`) ?? 0;
  if (f.region) return (m.get(`${a}|region:${f.region}`) ?? 0) + (m.get(`${a}|remote-in:${f.region.slice(0, 2)}`) ?? 0);
  if (f.country) return m.get(`${a}|country:${f.country}`) ?? 0;
  return m.get(`${a}|all`) ?? 0;
}

export type SeoLink = { href: string; jobs: number; f: Filters };

// Every role and place page with at least `min` live jobs, biggest first.
export async function seoPages(min = 3): Promise<SeoLink[]> {
  const out: SeoLink[] = [];
  const areas = [null, ...AREAS];
  for (const area of areas) {
    const base = { category: area?.category ?? undefined, role: area?.role ?? undefined };
    const shapes = [
      ...(area ? [readFilters(base)] : []),
      readFilters({ ...base, where: "remote" }),
      ...PLACES.map((p) => readFilters({ ...base, country: p.country ?? undefined, region: p.region ?? undefined, city: p.city ?? undefined })),
    ];
    for (const f of shapes) {
      const href = seoPath(f);
      const jobs = href ? await pageJobs(f) : null;
      if (href && jobs !== null && jobs >= min) out.push({ href, jobs, f });
    }
  }
  return out.sort((x, y) => y.jobs - x.jobs);
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
