import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobCard } from "@/components/JobCard";
import { JobView } from "@/components/JobView";
import { SITE_URL } from "@/lib/env";
import { jobPostingJsonLd } from "@/lib/jobs";
import { cardStates, getJob, relatedJobs, shownCopy } from "@/lib/queries";
import { myTimeZone } from "@/lib/myTz";
import { DEFAULT_TZ } from "@/lib/profile";
import { currentUser } from "@/lib/supabase/server";
import { ReportButton } from "./ReportButton";
import { ApplyButton, OcelotApply, SaveButton } from "./SaveApply";
import type { Stage } from "@/lib/tracker";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const job = await getJob((await params).slug);
  if (!job) return { title: "Job not found" };
  const live = job.status === "published";
  // A job listed more than once points search engines to the copy search shows.
  const shown = live ? await shownCopy(job.dupe_key ?? null) : null;
  return {
    title: `${job.title} at ${job.org.name}`,
    description: job.description.slice(0, 160),
    alternates: { canonical: `/jobs/${shown ?? job.slug}` },
    robots: live ? undefined : { index: false },
  };
}

export default async function JobPage({ params }: Props) {
  const job = await getJob((await params).slug);
  if (!job) notFound();
  const live = job.status === "published";
  const { supabase, user } = await currentUser();
  const [{ data: card }, { data: sent }] = user ? await Promise.all([
    supabase.from("tracker_items").select("id, stage, application_id").eq("job_id", job.id).order("created_at").limit(1).maybeSingle(),
    supabase.from("applications").select("id, submitted_at").eq("job_id", job.id).eq("candidate_id", user.id).maybeSingle(),
  ]) : [{ data: null }, { data: null }];
  const [tz, related] = await Promise.all([
    user && sent ? myTimeZone(supabase, user.id) : Promise.resolve(DEFAULT_TZ),
    live ? relatedJobs(job) : Promise.resolve({ company: [], similar: [] }),
  ]);
  const states = user ? await cardStates([...related.company, ...related.similar].map((j) => j.id)) : {};
  const props = {
    jobId: job.id, slug: job.slug, title: job.title, company: job.org.name, applyUrl: job.apply_method === "external" ? job.apply_url : null,
    signedIn: Boolean(user), card: card ? { id: card.id, stage: card.stage as Stage } : null,
  };
  const applyEl = job.apply_method === "ocelot"
    ? <OcelotApply slug={job.slug} signedIn={Boolean(user)} applied={sent ? { day: new Date(sent.submitted_at).toLocaleDateString("en-GB", { timeZone: tz, day: "numeric", month: "short" }), cardId: card?.application_id === sent.id ? card.id : null } : null} />
    : <ApplyButton {...props} />;
  return (
    <article className="mx-auto max-w-[1200px] px-5 pb-32 pt-10 md:px-8 md:py-16">
      {live ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{
          __html: JSON.stringify(jobPostingJsonLd(job, job.org, SITE_URL)).replace(/</g, "\\u003c"),
        }} />
      ) : null}
      <JobView job={job} org={job.org} questions={job.questions} aside={<ReportButton slug={job.slug} signedIn={Boolean(user)} />}
        apply={applyEl}
        save={live ? <SaveButton {...props} /> : null} />
      {related.company.length ? (
        <section className="mt-16">
          <h2 className="text-section-sm font-bold">More jobs at {job.org.name}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {related.company.map((j) => <JobCard key={j.id} job={j} company={job.org.name} agency={job.org.agency?.name} logo={job.org.logo_url} state={states[j.id] ?? null} signedIn={Boolean(user)} />)}
          </div>
        </section>
      ) : null}
      {related.similar.length ? (
        <section className="mt-16">
          <h2 className="text-section-sm font-bold">Similar jobs</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {related.similar.map((j) => <JobCard key={j.id} job={j} company={j.org?.name ?? ""} agency={j.org?.agency?.name} logo={j.org?.logo_url} state={states[j.id] ?? null} signedIn={Boolean(user)} />)}
          </div>
        </section>
      ) : null}
      {live ? (
        // On a phone, Apply and Save stay at the bottom of the screen while reading.
        <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-border bg-surface px-5 py-3 md:hidden">
          <div className="min-w-0 flex-1 [&_a]:w-full">
            {job.apply_method === "ocelot" ? applyEl : <ApplyButton {...props} hint={false} />}
          </div>
          <div className="shrink-0"><SaveButton {...props} /></div>
        </div>
      ) : null}
    </article>
  );
}
