import type { Metadata } from "next";
import { JobCard } from "@/components/JobCard";
import { Button, inputClass } from "@/components/ui";
import { listJobs } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Find jobs", alternates: { canonical: "/jobs" } };

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const jobs = await listJobs({ q });
  return (
    <div className="mx-auto max-w-[1200px] px-5 py-10 md:px-8 md:py-16">
      <h1 className="text-section-sm font-bold md:text-section">Find jobs</h1>
      <form className="mt-6 flex max-w-[860px] flex-col gap-3 sm:flex-row" role="search">
        <label htmlFor="q" className="sr-only">Role, company, or keyword</label>
        <input id="q" name="q" defaultValue={q} placeholder="Role, company, or keyword" className={inputClass} />
        <Button type="submit" className="h-12 sm:w-56">Find jobs</Button>
      </form>
      <p className="mt-6 text-meta text-muted" role="status">
        {jobs.length === 1 ? "1 job" : `${jobs.length} jobs`}
      </p>
      {jobs.length ? (
        <div className="mt-4 grid gap-4">
          {jobs.map((job) => <JobCard key={job.id} job={job} company={job.org?.name ?? ""} />)}
        </div>
      ) : (
        <p className="mt-4 text-body">{q ? "No jobs match this search." : "New jobs are on the way."}</p>
      )}
    </div>
  );
}
