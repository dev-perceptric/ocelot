import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Tag } from "@/components/ui";
import { JOB_STATUS } from "@/lib/jobStatus";
import { myOrgs } from "@/lib/org";
import { JobForm } from "../JobForm";
import { JobActions } from "./JobActions";

export const metadata: Metadata = { title: "Job" };
export const dynamic = "force-dynamic";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : "");

export default async function EditJob({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string; missing?: string }> }) {
  const { id } = await params;
  const { sent, missing } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, current } = await myOrgs();
  if (!current) redirect("/employer");
  const { data: job } = await supabase.from("jobs").select("*, job_questions(prompt, position)").eq("id", id).eq("org_id", current.id).maybeSingle();
  if (!job) notFound();
  const { data: org } = await supabase.from("orgs").select("trusted").eq("id", current.id).single();
  const status = JOB_STATUS[job.status] ?? { label: job.status, tone: "neutral" as const };
  const questions = [...(job.job_questions ?? [])].sort((a, b) => a.position - b.position).map((q) => q.prompt);
  const editable = job.status !== "closed" && job.status !== "expired" && job.status !== "suspended";

  const banner =
    job.status === "pending_review" ? "Ocelot is reviewing this job. You'll get an email when it's live or if it needs an update."
    : job.status === "rejected" ? `This job needs an update before it can go live: ${job.review_note}`
    : job.status === "published" ? `Live until ${day(job.expires_at)}.`
    : job.status === "closed" ? "This job is closed. Duplicate it to post it again."
    : job.status === "expired" ? "This job's 30 days are over. Duplicate it to post it again."
    : null;

  return (
    <>
      <Link href="/employer/jobs" className="text-meta underline">Jobs</Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-title font-bold">{job.title || "Untitled job"}</h1>
        <Tag tone={status.tone}>{status.label}</Tag>
      </div>
      {sent ? <p className="mt-4 border border-border bg-surface p-4 text-body rounded-[var(--radius-card)]" role="status">{job.status === "published" ? "Your job is live." : "Sent for review. You'll get an email when it's live."}</p> : null}
      {missing ? <p className="mt-4 border border-danger bg-danger-bg p-4 text-body text-danger rounded-[var(--radius-card)]" role="alert">Saved as a draft. {missing}</p> : null}
      {banner && !sent ? <p className={`mt-4 border p-4 text-body rounded-[var(--radius-card)] ${job.status === "rejected" ? "border-warning bg-warning-bg" : "border-border bg-surface"}`}>{banner}</p> : null}
      <div className="mt-6"><JobActions id={job.id} status={job.status} everPublished={Boolean(job.published_at)} slug={job.slug} /></div>
      {editable ? (
        <div className="mt-8">
          <JobForm live={job.status === "published"} trusted={Boolean(org?.trusted)} values={{
            id: job.id, title: job.title, role: job.role, seniority: job.seniority, employment_type: job.employment_type,
            workplace: job.workplace, office_places: job.office_places, eligible_countries: job.eligible_countries,
            salary_min: job.salary_min?.toString() ?? "", salary_max: job.salary_max?.toString() ?? "",
            salary_currency: job.salary_currency, salary_period: job.salary_period, description: job.description,
            apply_method: job.apply_method as "ocelot" | "external", apply_url: job.apply_url ?? "", questions,
          }} />
        </div>
      ) : null}
    </>
  );
}
