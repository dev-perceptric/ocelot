import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ButtonLink, Tag } from "@/components/ui";
import { SITE_URL } from "@/lib/env";
import { CATEGORY, EMPLOYMENT, SENIORITY, formatSalary, formatWhere, jobPostingJsonLd, postedAgo } from "@/lib/jobs";
import { getJob } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const job = await getJob((await params).slug);
  if (!job) return { title: "Job not found" };
  const live = job.status === "published";
  return {
    title: `${job.title} at ${job.org.name}`,
    description: job.description.slice(0, 160),
    alternates: { canonical: `/jobs/${job.slug}` },
    robots: live ? undefined : { index: false },
  };
}

export default async function JobPage({ params }: Props) {
  const job = await getJob((await params).slug);
  if (!job) notFound();
  const live = job.status === "published";
  const salary = formatSalary(job);
  const facts = [
    job.employment_type && EMPLOYMENT[job.employment_type],
    job.seniority && SENIORITY[job.seniority],
    job.category && CATEGORY[job.category],
  ].filter(Boolean) as string[];

  return (
    <article className="mx-auto max-w-[1200px] px-5 py-10 md:px-8 md:py-16">
      {live ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{
          __html: JSON.stringify(jobPostingJsonLd(job, job.org, SITE_URL)).replace(/</g, "\\u003c"),
        }} />
      ) : null}
      <div className="grid gap-10 md:grid-cols-[1fr_320px]">
        <div>
          <Link href={`/companies/${job.org.slug}`} className="text-body font-bold underline">{job.org.name}</Link>
          <h1 className="mt-2 text-section-sm font-bold md:text-section">{job.title}</h1>
          <p className="mt-3 text-body">{formatWhere(job)}</p>
          {salary ? <p className="mt-1 text-body font-bold">{salary}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {facts.map((f) => <Tag key={f}>{f}</Tag>)}
            {live ? null : <Tag>This role has closed</Tag>}
          </div>
          <div className="mt-10 max-w-[70ch] whitespace-pre-line font-[family-name:var(--font-editorial)] text-[18px] leading-[30px]">
            {job.description}
          </div>
        </div>
        <aside className="flex h-fit flex-col gap-3 border border-border p-6 rounded-[var(--radius-card)]">
          {live ? (
            job.apply_method === "external" && job.apply_url ? (
              <>
                <ButtonLink href={job.apply_url} target="_blank" rel="noopener nofollow">Apply on company site</ButtonLink>
                <p className="text-meta text-muted">This opens the company&apos;s application page. After applying, mark the job as Applied.</p>
              </>
            ) : (
              // Milestone 4 replaces this with the Ocelot application form.
              <ButtonLink href="/app">Apply</ButtonLink>
            )
          ) : (
            <p className="text-body">This role has closed.</p>
          )}
          <p className="text-meta text-muted">Posted {postedAgo(job.published_at).toLowerCase()}</p>
        </aside>
      </div>
    </article>
  );
}
