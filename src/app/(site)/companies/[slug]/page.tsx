import type { Metadata } from "next";
import { industryName } from "@/lib/taxonomy";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { JobCard } from "@/components/JobCard";
import { CompanyLogo, Tag } from "@/components/ui";
import { SIZE_LABEL } from "@/lib/company";
import { placeName } from "@/lib/places";
import { getOrg } from "@/lib/queries";
import { AREAS } from "@/lib/seo";
import { companyAreas, MIN_JOBS_EXTRA } from "@/lib/seoData";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await getOrg((await params).slug);
  if (!found || "movedTo" in found) return { title: "Company not found" };
  return { title: `Jobs at ${found.org.name}`, alternates: { canonical: `/companies/${found.org.slug}` } };
}

export default async function CompanyPage({ params }: Props) {
  const found = await getOrg((await params).slug);
  if (!found) notFound();
  if ("movedTo" in found) permanentRedirect(`/companies/${found.movedTo}`);
  const { org, jobs } = found;
  // Its jobs by area, for the areas with enough jobs to have a page of their own (/companies/stripe/sales-jobs).
  const byArea = (await companyAreas()).filter((c) => c.slug === org.slug && c.jobs >= MIN_JOBS_EXTRA)
    .map((c) => ({ ...c, a: AREAS.find((x) => (x.role ? `r:${x.role}` : `c:${x.category}`) === c.area) }))
    .filter((c) => c.a).sort((x, y) => y.jobs - x.jobs);
  const facts = [org.industry ? industryName(org.industry) : null, org.size ? SIZE_LABEL[org.size] : null, org.office_places.map(placeName).join(", ") || null].filter(Boolean);
  return (
    <div className="mx-auto max-w-[1200px] px-5 py-10 md:px-8 md:py-16">
      <div className="flex items-center gap-4">
        <CompanyLogo name={org.name} src={org.logo_url} size={64} />
        <h1 className="text-section-sm font-bold md:text-section">{org.name}</h1>
      </div>
      {facts.length ? <p className="mt-3 text-body text-muted">{facts.join(" / ")}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {org.business_verified_at ? <Tag tone="success">Company verified</Tag> : null}
        {org.email_verified_domain ? <Tag tone="info">Email verified</Tag> : null}
      </div>
      {org.agency ? (
        <p className="mt-3 text-body">Hiring through <Link href={`/agencies/${org.agency.slug}`} className="font-bold underline">{org.agency.name}</Link>, a recruiting agency. It posts these jobs and receives applications for {org.name}.</p>
      ) : null}
      {org.website ? (
        <a href={org.website} target="_blank" rel="noopener nofollow" className="mt-3 inline-block underline">{org.website.replace(/^https?:\/\//, "")}</a>
      ) : null}
      {org.about ? <p className="mt-6 max-w-[70ch] whitespace-pre-line font-[family-name:var(--font-editorial)] text-lede">{org.about}</p> : null}
      {byArea.length ? (
        <nav aria-label={`Jobs at ${org.name} by area`} className="mt-8 flex flex-wrap gap-2">
          {byArea.map((c) => (
            <Link key={c.area} href={`/companies/${org.slug}/${c.a!.slug}-jobs`}
              className="inline-flex min-h-10 items-center gap-2 border border-border bg-surface px-4 text-body hover:border-ink rounded-[var(--radius-control)]">
              {c.a!.label} <span className="text-meta text-muted">{c.jobs}</span>
            </Link>
          ))}
        </nav>
      ) : null}
      <h2 className="mt-12 text-card font-bold">{jobs.length === 1 ? "1 open job" : `${jobs.length} open jobs`}</h2>
      <div className="mt-4 grid gap-4">
        {jobs.map((job) => <JobCard key={job.id} job={job} company={org.name} agency={org.agency?.name} logo={org.logo_url} />)}
      </div>
    </div>
  );
}
