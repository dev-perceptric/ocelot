import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";
import { liveCompanies } from "@/lib/queries";
import { seoPages, sitemapJobs } from "@/lib/seoData";

export const dynamic = "force-dynamic";

// The sitemap in parts (search engines take at most 50,000 addresses a file): part 0 is the main pages, the role
// and place pages with jobs and the companies hiring; parts 1 to 4 list live jobs, 40,000 each. Closed jobs and
// the other copies of a job listed twice drop out on their own.
const PER_FILE = 40_000;
export const SITEMAP_PARTS = 5;

export async function generateSitemaps() {
  return Array.from({ length: SITEMAP_PARTS }, (_, id) => ({ id }));
}

export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const part = Number(await id);
  if (part === 0) {
    const [pages, companies] = await Promise.all([seoPages(), liveCompanies()]);
    return [
      { url: `${SITE_URL}/`, changeFrequency: "daily" },
      { url: `${SITE_URL}/jobs`, changeFrequency: "hourly" },
      { url: `${SITE_URL}/for-employers`, changeFrequency: "monthly" },
      { url: `${SITE_URL}/terms`, changeFrequency: "yearly" },
      { url: `${SITE_URL}/privacy`, changeFrequency: "yearly" },
      ...pages.map((p) => ({ url: `${SITE_URL}${p.href}`, changeFrequency: "daily" as const })),
      ...companies.map((c) => ({ url: `${SITE_URL}/companies/${c.slug}` })),
    ];
  }
  const jobs = (await sitemapJobs()).slice((part - 1) * PER_FILE, part * PER_FILE);
  return jobs.map((j) => ({ url: `${SITE_URL}/jobs/${j.slug}`, lastModified: j.published_at ?? undefined }));
}
