import type { Metadata } from "next";
import Link from "next/link";
import { JobCard } from "@/components/JobCard";
import { Button, inputClass, Pagination } from "@/components/ui";
import { EMPLOYMENT, SENIORITY } from "@/lib/jobs";
import { countryName, placeName } from "@/lib/places";
import { PAGE_SIZE, searchJobs } from "@/lib/queries";
import { activeCount, filtersQuery, readFilters, type Filters as F } from "@/lib/search";
import { categoryName, roleName } from "@/lib/taxonomy";
import { Filters } from "./Filters";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const f = readFilters(await searchParams);
  // Filtered result pages aren't indexed; only the main list is (avoids thin duplicate pages).
  return { title: "Find jobs", alternates: { canonical: "/jobs" }, robots: f.q || activeCount(f) ? { index: false, follow: true } : undefined };
}

const WHERE: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", on_site: "On-site" };

// Each active filter as a removable tag.
function chips(f: F) {
  const out: { label: string; without: Partial<F> }[] = [];
  f.where.forEach((w) => out.push({ label: WHERE[w], without: { where: f.where.filter((x) => x !== w) } }));
  if (f.country) out.push({ label: `Hiring in ${countryName(f.country)}`, without: { country: null } });
  if (f.city) out.push({ label: placeName(f.city), without: { city: null } });
  if (f.role) out.push({ label: roleName(f.role), without: { role: null, category: null } });
  else if (f.category) out.push({ label: categoryName(f.category), without: { category: null } });
  f.level.forEach((l) => out.push({ label: SENIORITY[l], without: { level: f.level.filter((x) => x !== l) } }));
  f.type.forEach((t) => out.push({ label: EMPLOYMENT[t], without: { type: f.type.filter((x) => x !== t) } }));
  if (f.pay) out.push({ label: "Shows pay", without: { pay: false } });
  return out;
}

export default async function JobsPage({ searchParams }: { searchParams: SP }) {
  const params = await searchParams;
  const f = readFilters(params);
  const page = Math.max(1, Number(params.page) || 1);
  const { jobs, total } = await searchJobs(f, page);
  const active = chips(f);

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-10 md:px-8 md:py-12">
      <h1 className="text-section-sm font-bold md:text-section">Find jobs</h1>
      <form action="/jobs" className="mt-6 flex max-w-[860px] flex-col gap-3 sm:flex-row" role="search">
        <label htmlFor="q" className="sr-only">Role, company, or keyword</label>
        <input id="q" name="q" defaultValue={f.q} placeholder="Role, company, or keyword" className={inputClass} />
        {/* Keep the other filters when searching again. */}
        {[...new URLSearchParams(filtersQuery({ ...f, q: "" }).slice(1))].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <Button type="submit" className="h-12 sm:w-56">Find jobs</Button>
      </form>

      <div className="mt-8 grid gap-8 md:grid-cols-[240px_1fr]">
        <Filters filters={f} total={total} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-2 text-meta text-muted" role="status">{total === 1 ? "1 job" : `${total.toLocaleString("en-US")} jobs`}</p>
            {active.map((c) => (
              <Link key={c.label} href={`/jobs${filtersQuery({ ...f, ...c.without })}`} aria-label={`Remove filter ${c.label}`}
                className="inline-flex items-center gap-1 border border-border bg-surface px-2 py-1 text-meta hover:border-ink rounded-[var(--radius-control)]">
                {c.label} <span aria-hidden>×</span>
              </Link>
            ))}
            {active.length > 1 ? <Link href={f.q ? `/jobs?q=${encodeURIComponent(f.q)}` : "/jobs"} className="text-meta underline">Clear filters</Link> : null}
          </div>
          {jobs.length ? (
            <div className="mt-4 grid gap-4">
              {jobs.map((job) => <JobCard key={job.id} job={job} company={job.org?.name ?? ""} logo={job.org?.logo_url} />)}
            </div>
          ) : (
            <div className="mt-4 border border-border bg-surface p-8 rounded-[var(--radius-card)]">
              <p className="text-card font-bold">{f.q || active.length ? "No jobs match." : "New jobs are on the way."}</p>
              {f.q || active.length ? <p className="mt-2 text-body text-muted">Try fewer filters or other words.</p> : null}
            </div>
          )}
          <Pagination page={page} hasNext={page * PAGE_SIZE < total} href={(n) => `/jobs${filtersQuery(f, n)}`} />
        </div>
      </div>
    </div>
  );
}
