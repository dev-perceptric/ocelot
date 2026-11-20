import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { CompanyLogo, PageNumbers } from "@/components/ui";
import { cardStates, getOrg, PAGE_SIZE, searchJobs } from "@/lib/queries";
import { readFilters, type Filters } from "@/lib/search";
import { AREAS } from "@/lib/seo";
import { companyAreas, MIN_JOBS_EXTRA, pageSummary } from "@/lib/seoData";
import { currentUser } from "@/lib/supabase/server";
import { JobList } from "../../../jobs/JobList";
import { factsLine, PageFacts } from "../../../jobs/PageFacts";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; area: string }>; searchParams: Promise<{ page?: string }> };

// A company's jobs in one area: /companies/stripe/sales-jobs, /companies/stripe/account-executive-jobs. Listed for
// search engines from 5 live jobs (company_area_counts, 037_seo_more.sql).
const areaFrom = (param: string) => (param.endsWith("-jobs") ? AREAS.find((a) => `${a.slug}-jobs` === param) ?? null : null);
const areaKey = (a: (typeof AREAS)[number]) => (a.role ? `r:${a.role}` : `c:${a.category}`);
const filtersFor = (a: (typeof AREAS)[number]): Filters => readFilters(a.role ? { role: a.role } : { category: a.category ?? undefined });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, area: param } = await params;
  const area = areaFrom(param);
  const found = area ? await getOrg(slug) : null;
  if (!area || !found || "movedTo" in found) return { title: "Page not found" };
  const heading = `${area.label} jobs at ${found.org.name}`;
  const [summary, counts] = await Promise.all([pageSummary(filtersFor(area), found.org.slug), companyAreas()]);
  const jobs = counts.find((c) => c.slug === found.org.slug && c.area === areaKey(area))?.jobs ?? 0;
  return {
    title: summary?.jobs ? `${heading} (${summary.jobs.toLocaleString("en-US")})` : heading,
    description: factsLine(heading, summary, { companies: false }),
    alternates: { canonical: `/companies/${found.org.slug}/${param}` },
    robots: jobs >= MIN_JOBS_EXTRA ? undefined : { index: false, follow: true },
  };
}

export default async function CompanyAreaPage({ params, searchParams }: Props) {
  const { slug, area: param } = await params;
  const area = areaFrom(param);
  if (!area) notFound();
  const found = await getOrg(slug);
  if (!found) notFound();
  if ("movedTo" in found) permanentRedirect(`/companies/${found.movedTo}/${param}`);
  const { org } = found;
  const page = Math.max(1, Math.min(1000, Number((await searchParams).page) || 1));
  const f = filtersFor(area);
  const [{ jobs, total }, summary, counts, { user }] = await Promise.all([
    searchJobs({ ...f, company: org.slug }, page), page === 1 ? pageSummary(f, org.slug) : Promise.resolve(null), companyAreas(), currentUser(),
  ]);
  if (!total && page === 1) notFound();
  const states = user ? await cardStates(jobs.map((j) => j.id)) : {};
  const key = areaKey(area);
  const listed = (c: { jobs: number }) => c.jobs >= MIN_JOBS_EXTRA;
  const otherAreas = counts.filter((c) => c.slug === org.slug && c.area !== key && listed(c))
    .map((c) => ({ ...c, a: AREAS.find((x) => areaKey(x) === c.area) })).filter((c) => c.a).sort((x, y) => y.jobs - x.jobs);
  const otherCompanies = counts.filter((c) => c.area === key && c.slug !== org.slug && listed(c)).sort((x, y) => y.jobs - x.jobs).slice(0, 12);

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-10 md:px-8 md:py-12">
      <div className="flex items-center gap-4">
        <CompanyLogo name={org.name} src={org.logo_url} size={48} />
        <h1 className="text-section-sm font-bold md:text-section">{area.label} jobs at {org.name}</h1>
      </div>
      <p className="mt-3 text-body"><Link href={`/companies/${org.slug}`} className="underline">All jobs at {org.name}</Link></p>
      <PageFacts s={summary} />
      <p className="mt-6 text-meta text-muted" role="status">{total.toLocaleString("en-US")} {total === 1 ? "job" : "jobs"}</p>
      <JobList jobs={jobs} states={states} signedIn={Boolean(user)} />
      <PageNumbers page={page} total={total} size={PAGE_SIZE} href={(n) => `/companies/${org.slug}/${param}${n > 1 ? `?page=${n}` : ""}`} />
      {otherAreas.length ? (
        <section className="mt-10">
          <h2 className="text-card font-bold">More at {org.name}</h2>
          <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {otherAreas.map((c) => (
              <li key={c.area}><Link href={`/companies/${org.slug}/${c.a!.slug}-jobs`} className="text-body underline-offset-2 hover:underline">{c.a!.label} jobs</Link> <span className="text-meta text-muted">{c.jobs}</span></li>
            ))}
          </ul>
        </section>
      ) : null}
      {otherCompanies.length ? (
        <section className="mt-10">
          <h2 className="text-card font-bold">{area.label} jobs at other companies</h2>
          <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {otherCompanies.map((c) => (
              <li key={c.slug}><Link href={`/companies/${c.slug}/${param}`} className="text-body underline-offset-2 hover:underline">{area.label} jobs at {c.name}</Link> <span className="text-meta text-muted">{c.jobs}</span></li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
