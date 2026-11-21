import Link from "next/link";
import { PageNumbers } from "@/components/ui";
import { EMPLOYMENT, SENIORITY } from "@/lib/jobs";
import { countryName, placeName } from "@/lib/places";
import { regionName } from "@/lib/regions";
import { cardStates, countJobs, PAGE_SIZE, searchJobs } from "@/lib/queries";
import { filtersQuery, payLabel, POSTED_LABEL, readFilters, type Filters as F } from "@/lib/search";
import { searchHref } from "@/lib/seo";
import { categoryName, roleName } from "@/lib/taxonomy";
import { currentUser } from "@/lib/supabase/server";
import { FilterBar, SortPicker } from "./Filters";
import { JobList } from "./JobList";
import { SearchBox } from "./SearchBox";
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
  if (f.noAgency) out.push({ label: "Posted by companies", without: { noAgency: false } });
  return out;
}

// When a search finds nothing: the same search with one thing taken away, with how many jobs each finds. Up to three.
async function looser(f: F, active: ReturnType<typeof chips>): Promise<{ label: string; href: string; jobs: number }[]> {
  const tries: { label: string; f: F }[] = [];
  if (f.q) tries.push({ label: active.length ? `"${f.q}" with no filters` : `All jobs`, f: active.length ? readFilters({ q: f.q }) : readFilters({}) });
  if (f.q && active.length) tries.push({ label: `${active.map((c) => c.label).join(", ")} without "${f.q}"`, f: { ...f, q: "" } });
  for (const c of active) tries.push({ label: `Without ${c.label}`, f: { ...f, ...c.without } });
  if (f.q && !f.where.includes("remote")) tries.push({ label: `Remote "${f.q}" jobs`, f: { ...readFilters({ q: f.q }), where: ["remote"] } });
  const counted = await Promise.all(tries.slice(0, 5).map(async (t) => ({ label: t.label, href: searchHref(t.f), jobs: await countJobs(t.f) })));
  return counted.filter((t) => t.jobs > 0).sort((a, b) => b.jobs - a.jobs).slice(0, 3);
}

export async function JobResults({ filters: f, page, heading, intro, footer }: { filters: F; page: number; heading: React.ReactNode; intro?: React.ReactNode; footer?: React.ReactNode }) {
  const [{ jobs, total }, { user }] = await Promise.all([searchJobs(f, page), currentUser()]);
  const active = chips(f);
  const [states, alternatives] = await Promise.all([
    user ? cardStates(jobs.map((j) => j.id)) : Promise.resolve({}),
    !jobs.length && (f.q || active.length) ? looser(f, active) : Promise.resolve([]),
  ]);
  const from = (page - 1) * PAGE_SIZE + 1, to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-10 md:px-8 md:py-12">
      {heading}
      {/* Keep the other filters when searching again. */}
      <SearchBox key={f.q} q={f.q} keep={[...new URLSearchParams(filtersQuery({ ...f, q: "" }).slice(1))]} className="mt-6" />
      {intro}

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
        <JobList jobs={jobs} states={states} signedIn={Boolean(user)} />
      ) : (
        <div className="mt-4 border border-border bg-surface p-8 rounded-[var(--radius-card)]">
          <p className="text-card font-bold">{f.q || active.length ? `No jobs match${f.q ? ` "${f.q}"` : ""}${active.length ? ` with ${active.map((c) => c.label).join(", ")}` : ""}.` : "New jobs are on the way."}</p>
          {alternatives.length ? (
            <>
              <p className="mt-2 text-body text-muted">These searches have jobs:</p>
              <ul className="mt-3 flex flex-col gap-2">
                {alternatives.map((a) => (
                  <li key={a.href}><Link href={a.href} className="text-body font-bold underline">{a.label}</Link> <span className="text-meta text-muted">{a.jobs.toLocaleString("en-US")} {a.jobs === 1 ? "job" : "jobs"}</span></li>
                ))}
              </ul>
            </>
          ) : f.q || active.length ? <p className="mt-2 text-body text-muted">Try fewer filters or other words.</p> : null}
        </div>
      )}
      <PageNumbers page={page} total={total} size={PAGE_SIZE} href={(n) => searchHref(f, n)} />
      {footer}
    </div>
  );
}
