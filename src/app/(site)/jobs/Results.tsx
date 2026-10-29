import Link from "next/link";
import { JobCard } from "@/components/JobCard";
import { Button, inputClass, PageNumbers } from "@/components/ui";
import { EMPLOYMENT, SENIORITY } from "@/lib/jobs";
import { countryName, placeName } from "@/lib/places";
import { regionName } from "@/lib/regions";
import { PAGE_SIZE, searchJobs } from "@/lib/queries";
import { filtersQuery, payLabel, POSTED_LABEL, readFilters, type Filters as F } from "@/lib/search";
import { searchHref } from "@/lib/seo";
import { categoryName, roleName } from "@/lib/taxonomy";
import { currentUser } from "@/lib/supabase/server";
import { FilterBar, SortPicker } from "./Filters";
import { SaveSearch } from "./SaveSearch";

// Find jobs and every role and place page: the search box, the filter bar, the list and its pages.

const WHERE: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", on_site: "On-site" };

// Each active filter as a removable tag.
export function chips(f: F) {
  const out: { label: string; without: Partial<F> }[] = [];
  f.where.forEach((w) => out.push({ label: WHERE[w], without: { where: f.where.filter((x) => x !== w) } }));
  if (f.country) out.push({ label: `Hiring in ${countryName(f.country)}`, without: { country: null } });
  if (f.region) out.push({ label: regionName(f.region), without: { region: null } });
  if (f.city) out.push({ label: placeName(f.city), without: { city: null } });
  if (f.role) out.push({ label: roleName(f.role), without: { role: null, category: null } });
  else if (f.category) out.push({ label: categoryName(f.category), without: { category: null } });
  f.level.forEach((l) => out.push({ label: SENIORITY[l], without: { level: f.level.filter((x) => x !== l) } }));
  f.type.forEach((t) => out.push({ label: EMPLOYMENT[t], without: { type: f.type.filter((x) => x !== t) } }));
  if (f.pay) out.push({ label: "Shows pay", without: { pay: false } });
  if (f.posted) out.push({ label: POSTED_LABEL[f.posted], without: { posted: null } });
  if (f.minPay) out.push({ label: payLabel(f.minPay), without: { minPay: null } });
  return out;
}

export async function JobResults({ filters: f, page, heading, footer }: { filters: F; page: number; heading: React.ReactNode; footer?: React.ReactNode }) {
  const [{ jobs, total }, { user }] = await Promise.all([searchJobs(f, page), currentUser()]);
  const active = chips(f);
  const from = (page - 1) * PAGE_SIZE + 1, to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-10 md:px-8 md:py-12">
      {heading}
      <form action="/jobs" className="mt-6 flex max-w-[860px] flex-col gap-3 sm:flex-row" role="search">
        <label htmlFor="q" className="sr-only">Role, company, or keyword</label>
        <input id="q" name="q" defaultValue={f.q} placeholder="Role, company, or keyword" className={inputClass} />
        {/* Keep the other filters when searching again. */}
        {[...new URLSearchParams(filtersQuery({ ...f, q: "" }).slice(1))].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <Button type="submit" className="h-12 sm:w-56">Find jobs</Button>
      </form>

      <div className="mt-4"><FilterBar filters={f} /></div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <p className="mr-2 text-meta text-muted" role="status">
          {total === 0 ? "0 jobs" : total <= PAGE_SIZE ? `${total.toLocaleString("en-US")} ${total === 1 ? "job" : "jobs"}` : `${from.toLocaleString("en-US")}–${to.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} jobs`}
        </p>
        {active.map((c) => (
          <Link key={c.label} href={searchHref({ ...f, ...c.without })} aria-label={`Remove filter ${c.label}`}
            className="inline-flex items-center gap-1 border border-border bg-surface px-2 py-1 text-meta hover:border-ink rounded-[var(--radius-control)]">
            {c.label} <span aria-hidden>×</span>
          </Link>
        ))}
        {active.length > 1 ? <Link href={searchHref(readFilters({ q: f.q }))} className="text-meta underline">Clear all</Link> : null}
        <div className="ml-auto flex items-center gap-2">
          <SortPicker filters={f} />
          <SaveSearch signedIn={Boolean(user)} search={filtersQuery(f)}
            defaultName={(f.q ? [f.q, ...active.map((c) => c.label)] : active.map((c) => c.label)).slice(0, 3).join(", ") || "New jobs"} />
        </div>
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
      <PageNumbers page={page} total={total} size={PAGE_SIZE} href={(n) => searchHref(f, n)} />
      {footer}
    </div>
  );
}
