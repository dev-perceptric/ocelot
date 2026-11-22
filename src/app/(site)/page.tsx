import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { Button, inputClass } from "@/components/ui";
import { cardStates, hiringCompanies, searchJobs } from "@/lib/queries";
import { readFilters } from "@/lib/search";
import { currentUser } from "@/lib/supabase/server";
import { EndlessList } from "./jobs/EndlessList";
import { StickyFilters } from "./jobs/StickyFilters";

const n = (x: number) => x.toLocaleString("en-US");

// The home page is the job board: search at the top, filters that stay in view, and every live job in one list that
// keeps loading as you scroll. Picking a filter opens Find jobs with it.
export default async function Home() {
  const [{ jobs, total }, companies, { user }] = await Promise.all([searchJobs({}, 1), hiringCompanies(), currentUser()]);
  const states = user ? await cardStates(jobs.map((j) => j.id)) : {};

  return (
    <>
      <section className="bg-canvas">
        <div className="mx-auto max-w-[1200px] px-5 py-12 md:px-8 md:py-16">
          <h1 className="text-display-sm font-black md:text-display">
            Land your next <span className="highlight">dream job.</span>
          </h1>
          <p className="mt-5 max-w-[640px] font-[family-name:var(--font-editorial)] text-lede">
            {total
              ? <>{n(total)} jobs from {n(companies.length)} companies around the world. Search for free, then track every application in one place.</>
              : "Jobs from companies around the world. Search for free, then track every application in one place."}
          </p>
          <form action="/jobs" className="mt-8 flex max-w-[760px] flex-col gap-3 sm:flex-row" role="search">
            <label htmlFor="q" className="sr-only">Role, company, place or keyword</label>
            <div className="relative flex-1">
              <Search size={20} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
              <input id="q" name="q" placeholder="Role, company, place or keyword" className={`${inputClass} pl-12`} />
            </div>
            <Button type="submit" className="h-12 sm:w-48">Search</Button>
          </form>
          <Link href="/app" className="mt-6 inline-flex items-center gap-2 text-body font-bold underline-offset-2 hover:underline">
            Save jobs and track your applications in My search <ArrowRight size={18} strokeWidth={1.75} aria-hidden />
          </Link>
        </div>
      </section>

      {/* The filters stay at the top of the screen while the list scrolls under them. */}
      <div className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1200px] items-center gap-4 px-5 py-3 md:px-8">
          <div className="min-w-0 flex-1">
            <StickyFilters filters={readFilters({})} end={total ? <p className="hidden shrink-0 text-meta text-muted lg:block">{n(total)} jobs</p> : null} />
          </div>
        </div>
      </div>

      <section aria-label="Latest jobs" className="mx-auto max-w-[1200px] px-5 pb-16 md:px-8">
        {jobs.length ? (
          <EndlessList first={jobs} states={states} total={total} signedIn={Boolean(user)} panelTop="top-24 max-h-[calc(100vh-7rem)]" />
        ) : (
          <p className="mt-8 border border-border bg-surface p-8 text-card font-bold rounded-[var(--radius-card)]">New jobs are on the way.</p>
        )}
      </section>
    </>
  );
}
