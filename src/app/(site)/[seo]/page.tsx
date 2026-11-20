import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parseSeoPath, seoHeading, seoPath } from "@/lib/seo";
import { minJobs, pageJobs, pageSummary } from "@/lib/seoData";
import { factsLine, PageFacts } from "../jobs/PageFacts";
import { JobResults } from "../jobs/Results";
import { SeoLinks } from "../jobs/SeoLinks";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ seo: string }>; searchParams: Promise<{ page?: string }> };

// Role and place pages: /sales-jobs-in-texas, /remote-marketing-jobs, /senior-account-executive-jobs-in-new-york,
// /marketing-internships. A Find jobs search with its own address, heading, the numbers for this search, and links to
// nearby pages. Pages with too few jobs (minJobs: 3, or 5 with an extra filter) stay out of search engines.

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const f = parseSeoPath((await params).seo);
  if (!f) return { title: "Page not found" };
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const heading = seoHeading(f);
  const [jobs, summary] = await Promise.all([pageJobs(f), pageSummary(f)]);
  const path = seoPath(f)!;
  const count = summary?.jobs || jobs || 0;
  return {
    title: count ? `${heading} (${count.toLocaleString("en-US")})` : heading,
    description: factsLine(heading, summary),
    alternates: { canonical: page > 1 ? `${path}?page=${page}` : path },
    robots: (jobs ?? 0) >= minJobs(f) ? undefined : { index: false, follow: true },
  };
}

export default async function SeoPage({ params, searchParams }: Props) {
  const f = parseSeoPath((await params).seo);
  if (!f) notFound();
  const page = Math.max(1, Math.min(1000, Number((await searchParams).page) || 1));
  const heading = seoHeading(f);
  const summary = page === 1 ? await pageSummary(f) : null;
  return (
    <JobResults filters={f} page={page} footer={<SeoLinks filters={f} />}
      heading={<><h1 className="text-section-sm font-bold md:text-section">{heading}</h1><PageFacts s={summary} /></>} />
  );
}
