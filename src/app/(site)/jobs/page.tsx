import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { activeCount, readFilters } from "@/lib/search";
import { seoPath } from "@/lib/seo";
import { JobResults } from "./Results";
import { SeoLinks } from "./SeoLinks";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const f = readFilters(await searchParams);
  // Filtered result pages aren't indexed; only the main list is (avoids thin duplicate pages).
  return { title: "Find jobs", alternates: { canonical: "/jobs" }, robots: f.q || activeCount(f) ? { index: false, follow: true } : undefined };
}

export default async function JobsPage({ searchParams }: { searchParams: SP }) {
  const params = await searchParams;
  const page = Math.max(1, Math.min(1000, Number(params.page) || 1));
  const f = readFilters(params);
  // A search with its own page (sales in Texas, or just "Texas" typed in the box) lives at that address.
  const clean = seoPath(f);
  if (clean) permanentRedirect(page > 1 ? `${clean}?page=${page}` : clean);
  return <JobResults filters={f} page={page} footer={activeCount(f) || f.q ? null : <SeoLinks />}
    heading={<h1 className="text-section-sm font-bold md:text-section">Find jobs</h1>} />;
}
