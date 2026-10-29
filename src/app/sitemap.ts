import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";
import { listJobs } from "@/lib/queries";

export const dynamic = "force-dynamic";

// Live jobs and the companies behind them. Closed jobs drop out on their own.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const jobs = await listJobs({ limit: 5000 });
  const companies = [...new Set(jobs.map((j) => j.org?.slug).filter(Boolean))];
  return [
    { url: `${SITE_URL}/`, changeFrequency: "daily" },
    { url: `${SITE_URL}/jobs`, changeFrequency: "hourly" },
    { url: `${SITE_URL}/for-employers`, changeFrequency: "monthly" },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly" },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly" },
    ...jobs.map((j) => ({ url: `${SITE_URL}/jobs/${j.slug}`, lastModified: j.published_at ?? undefined })),
    ...companies.map((s) => ({ url: `${SITE_URL}/companies/${s}` })),
  ];
}
