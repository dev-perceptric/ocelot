import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobCard } from "@/components/JobCard";
import { Tag } from "@/components/ui";
import { getOrg } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await getOrg((await params).slug);
  if (!found) return { title: "Company not found" };
  return { title: `Jobs at ${found.org.name}`, alternates: { canonical: `/companies/${found.org.slug}` } };
}

export default async function CompanyPage({ params }: Props) {
  const found = await getOrg((await params).slug);
  if (!found) notFound();
  const { org, jobs } = found;
  return (
    <div className="mx-auto max-w-[1200px] px-5 py-10 md:px-8 md:py-16">
      <h1 className="text-section-sm font-bold md:text-section">{org.name}</h1>
      <div className="mt-3 flex flex-wrap gap-2">
        {org.business_verified_at ? <Tag tone="success">Company verified</Tag> : null}
        {org.email_verified_domain ? <Tag tone="info">Email verified</Tag> : null}
      </div>
      {org.website ? (
        <a href={org.website} target="_blank" rel="noopener nofollow" className="mt-3 inline-block underline">{org.website.replace(/^https?:\/\//, "")}</a>
      ) : null}
      {org.about ? <p className="mt-6 max-w-[70ch] whitespace-pre-line font-[family-name:var(--font-editorial)] text-lede">{org.about}</p> : null}
      <h2 className="mt-12 text-card font-bold">{jobs.length === 1 ? "1 open job" : `${jobs.length} open jobs`}</h2>
      <div className="mt-4 grid gap-4">
        {jobs.map((job) => <JobCard key={job.id} job={job} company={org.name} />)}
      </div>
    </div>
  );
}
