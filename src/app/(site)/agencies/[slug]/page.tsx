import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobCard } from "@/components/JobCard";
import { CompanyLogo, Tag } from "@/components/ui";
import { getAgency } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await getAgency((await params).slug);
  if (!found) return { title: "Agency not found" };
  return {
    title: `${found.agency.name}: recruiting agency jobs`,
    description: `Jobs ${found.agency.name} is hiring for on Ocelot.`,
    alternates: { canonical: `/agencies/${found.agency.slug}` },
    robots: found.total ? undefined : { index: false },
  };
}

// A recruiting agency's public page: who they are and the live jobs they post for their clients.
export default async function AgencyPage({ params }: Props) {
  const found = await getAgency((await params).slug);
  if (!found) notFound();
  const { agency, jobs, total } = found;
  const clients = new Set(jobs.map((j) => j.org?.name).filter(Boolean)).size;

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-10 md:px-8 md:py-16">
      <div className="flex items-center gap-4">
        <CompanyLogo name={agency.name} src={agency.logo_url} size={64} />
        <h1 className="text-section-sm font-bold md:text-section">{agency.name}</h1>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Tag>Recruiting agency</Tag>
        {agency.business_verified_at ? <Tag tone="success">Agency verified</Tag> : null}
      </div>
      <p className="mt-3 max-w-[70ch] text-body text-muted">
        {agency.name} posts jobs on Ocelot for the companies it hires for. Each job names the company, and applications go to both the agency and the company. Agencies on Ocelot never charge candidates.
      </p>
      {agency.website ? (
        <a href={agency.website} target="_blank" rel="noopener nofollow" className="mt-3 inline-block underline">{agency.website.replace(/^https?:\/\//, "")}</a>
      ) : null}
      {agency.about ? <p className="mt-6 max-w-[70ch] whitespace-pre-line font-[family-name:var(--font-editorial)] text-lede">{agency.about}</p> : null}

      <h2 className="mt-12 text-card font-bold">
        {total === 1 ? "1 open job" : `${total} open jobs`}{clients > 1 ? ` for ${clients} companies` : ""}
      </h2>
      <div className="mt-4 grid gap-4">
        {jobs.map((job) => <JobCard key={job.id} job={job} company={job.org?.name ?? ""} agency={agency.name} logo={job.org?.logo_url} />)}
      </div>
    </div>
  );
}
