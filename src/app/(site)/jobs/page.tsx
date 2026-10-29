import type { Metadata } from "next";
import { activeCount, readFilters } from "@/lib/search";
import { JobResults } from "./Results";

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
  return <JobResults filters={readFilters(params)} page={page} heading={<h1 className="text-section-sm font-bold md:text-section">Find jobs</h1>} />;
}
