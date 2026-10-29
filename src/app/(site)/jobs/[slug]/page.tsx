import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobView } from "@/components/JobView";
import { SITE_URL } from "@/lib/env";
import { jobPostingJsonLd } from "@/lib/jobs";
import { getJob } from "@/lib/queries";
import { currentUser } from "@/lib/supabase/server";
import { ReportButton } from "./ReportButton";
import { ApplyButton, SaveButton } from "./SaveApply";
import type { Stage } from "@/lib/tracker";

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
  const { supabase, user } = await currentUser();
  const { data: card } = user ? await supabase.from("tracker_items").select("id, stage").eq("job_id", job.id).maybeSingle() : { data: null };
  const props = {
    jobId: job.id, slug: job.slug, title: job.title, company: job.org.name, applyUrl: job.apply_method === "external" ? job.apply_url : null,
    signedIn: Boolean(user), card: card ? { id: card.id, stage: card.stage as Stage } : null,
  };
  return (
    <article className="mx-auto max-w-[1200px] px-5 py-10 md:px-8 md:py-16">
      {live ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{
          __html: JSON.stringify(jobPostingJsonLd(job, job.org, SITE_URL)).replace(/</g, "\\u003c"),
        }} />
      ) : null}
      <JobView job={job} org={job.org} questions={job.questions} aside={<ReportButton slug={job.slug} signedIn={Boolean(user)} />}
        apply={<ApplyButton {...props} />} save={live ? <SaveButton {...props} /> : null} />
    </article>
  );
}
