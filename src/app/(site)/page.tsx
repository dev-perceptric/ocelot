import Link from "next/link";
import { JobCard } from "@/components/JobCard";
import { ButtonLink, inputClass, Button } from "@/components/ui";
import { listJobs } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  const jobs = await listJobs({ limit: 6 });
  return (
    <>
      <section className="bg-canvas">
        <div className="mx-auto max-w-[1200px] px-5 py-16 md:px-8 md:py-24">
          <h1 className="text-display-sm font-black md:text-display">
            Find your
            <br />
            <span className="highlight">next move.</span>
          </h1>
          <p className="mt-6 font-[family-name:var(--font-editorial)] text-lede">Discover roles. Keep every application in sight.</p>
          <form action="/jobs" className="mt-8 flex max-w-[860px] flex-col gap-3 sm:flex-row" role="search">
            <label htmlFor="q" className="sr-only">Role, company, or keyword</label>
            <input id="q" name="q" placeholder="Role, company, or keyword" className={inputClass} />
            <Button type="submit" className="h-12 sm:w-56">Find jobs</Button>
          </form>
        </div>
      </section>

      {jobs.length ? (
        <section className="mx-auto max-w-[1200px] px-5 py-16 md:px-8">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-section-sm font-bold md:text-section">New jobs</h2>
            <Link href="/jobs" className="font-bold underline">See all jobs</Link>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {jobs.map((job) => <JobCard key={job.id} job={job} company={job.org?.name ?? ""} logo={job.org?.logo_url} />)}
          </div>
        </section>
      ) : null}

      <section className="mx-auto max-w-[1200px] px-5 py-16 md:px-8 md:py-24">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-section-sm font-bold md:text-section">Your entire job search, organized.</h2>
            <p className="mt-4 font-[family-name:var(--font-editorial)] text-lede">
              Track jobs from Ocelot and jobs you found elsewhere. Keep notes, tasks and interviews in one place. Only you can see your tracker.
            </p>
            <ButtonLink href="/app" className="mt-8">Start tracking</ButtonLink>
          </div>
          <div className="bg-ink p-8 text-surface md:p-10">
            <h2 className="text-section-sm font-bold">Meet your next great hire.</h2>
            <p className="mt-4 font-[family-name:var(--font-editorial)] text-lede">
              Publish a role and manage applicants in one straightforward workspace.
            </p>
            <ButtonLink href="/for-employers" className="mt-8">Post a job</ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
