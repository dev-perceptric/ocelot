import Link from "next/link";
import { notFound } from "next/navigation";
import { JobView } from "@/components/JobView";
import { Tag } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import type { Job } from "@/lib/jobs";
import { JOB_STATUS } from "@/lib/jobStatus";
import { createAdmin } from "@/lib/supabase/server";
import { when } from "../../format";
import { ReviewButtons } from "./ReviewButtons";

export const dynamic = "force-dynamic";

export default async function ReviewJob({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = createAdmin();
  const { data: job } = await db.from("jobs").select("*, job_questions(prompt, position), org:orgs(*)").eq("id", id).maybeSingle();
  if (!job || !job.org) notFound();
  const org = job.org;
  const [{ count: published }, { count: reports }, { data: creator }] = await Promise.all([
    db.from("jobs").select("id", { count: "exact", head: true }).eq("org_id", org.id).not("published_at", "is", null),
    db.from("reports").select("id", { count: "exact", head: true }).eq("org_id", org.id),
    job.created_by ? db.from("profiles").select("email, full_name").eq("id", job.created_by).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const questions = [...(job.job_questions ?? [])].sort((a, b) => a.position - b.position).map((q) => q.prompt);
  const status = JOB_STATUS[job.status];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/review" className="text-meta underline">Review</Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-title font-bold">{job.title}</h1>
          <Tag tone={status?.tone}>{status?.label ?? job.status}</Tag>
        </div>
        <p className="mt-2 text-body text-muted">
          <Link href={`/admin/companies/${org.id}`} className="underline">{org.name}</Link>
          {org.website ? `, ${org.website}` : ""}. {published ?? 0} jobs published before, {reports ?? 0} reports.
          {creator ? ` Written by ${creator.full_name || creator.email}.` : ""} Sent {when(job.updated_at)}.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {org.suspended_at ? <Tag tone="danger">Company suspended</Tag> : null}
          {org.business_verified_at ? <Tag tone="success">Company verified</Tag> : <Tag>Not verified</Tag>}
          {org.email_verified_domain ? <Tag tone="info">Email verified: {org.email_verified_domain}</Tag> : <Tag>Email not verified</Tag>}
        </div>
        {job.status === "pending_review" ? <div className="mt-6"><ReviewButtons id={job.id} title={job.title} /></div> : null}
      </div>
      <div className="bg-surface p-6 md:p-10 rounded-[var(--radius-card)]">
        <JobView job={job as unknown as Job} org={org} questions={questions} mode="preview" />
      </div>
    </div>
  );
}
