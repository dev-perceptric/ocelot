import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parseSeoPath, seoHeading, seoPath } from "@/lib/seo";
import { pageJobs } from "@/lib/seoData";
import { JobResults } from "../jobs/Results";
import { SeoLinks } from "../jobs/SeoLinks";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ seo: string }>; searchParams: Promise<{ page?: string }> };

// Role and place pages: /sales-jobs-in-texas, /remote-marketing-jobs. A Find jobs search with its own address,
// heading and links to nearby pages. Pages with fewer than 3 jobs stay out of search engines.
const MIN_JOBS = 3;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const f = parseSeoPath((await params).seo);
  if (!f) return { title: "Page not found" };
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const heading = seoHeading(f);
  const jobs = await pageJobs(f);
  const path = seoPath(f)!;
  return {
    title: jobs ? `${heading} (${jobs.toLocaleString("en-US")})` : heading,
    description: jobs
      ? `${jobs.toLocaleString("en-US")} ${heading.charAt(0).toLowerCase()}${heading.slice(1)}, updated every day. Apply on the company's site and track every application on Ocelot.`
      : `${heading} on Ocelot.`,
    alternates: { canonical: page > 1 ? `${path}?page=${page}` : path },
    robots: (jobs ?? 0) >= MIN_JOBS ? undefined : { index: false, follow: true },
  };
}

export default async function SeoPage({ params, searchParams }: Props) {
  const f = parseSeoPath((await params).seo);
  if (!f) notFound();
  const page = Math.max(1, Math.min(1000, Number((await searchParams).page) || 1));
  const heading = seoHeading(f);
  return (
    <JobResults filters={f} page={page} footer={<SeoLinks filters={f} />}
      heading={<h1 className="text-section-sm font-bold md:text-section">{heading}</h1>} />
  );
}
