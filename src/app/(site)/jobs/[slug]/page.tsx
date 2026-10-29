import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobView } from "@/components/JobView";
import { SITE_URL } from "@/lib/env";
import { jobPostingJsonLd } from "@/lib/jobs";
import { getJob } from "@/lib/queries";
import { currentUser } from "@/lib/supabase/server";
import { ReportButton } from "./ReportButton";

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
  const { user } = await currentUser();
  return (
    <article className="mx-auto max-w-[1200px] px-5 py-10 md:px-8 md:py-16">
      {live ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{
          __html: JSON.stringify(jobPostingJsonLd(job, job.org, SITE_URL)).replace(/</g, "\\u003c"),
        }} />
      ) : null}
      <JobView job={job} org={job.org} questions={job.questions} aside={<ReportButton slug={job.slug} signedIn={Boolean(user)} />} />
    </article>
  );
}
