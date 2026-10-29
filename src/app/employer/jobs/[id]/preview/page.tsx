import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { JobView } from "@/components/JobView";
import type { Job } from "@/lib/jobs";
import { myOrgs } from "@/lib/org";

export const metadata: Metadata = { title: "Preview" };
export const dynamic = "force-dynamic";

export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, current } = await myOrgs();
  if (!current) redirect("/employer");
  const { data: job } = await supabase.from("jobs").select("*, job_questions(prompt, position), org:orgs(*)").eq("id", id).eq("org_id", current.id).maybeSingle();
  if (!job || !job.org) notFound();
  const questions = [...(job.job_questions ?? [])].sort((a, b) => a.position - b.position).map((q) => q.prompt);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-surface p-4 rounded-[var(--radius-card)]">
        <p className="text-body font-bold">Preview: this is how candidates will see the job.</p>
        <Link href={`/employer/jobs/${id}`} className="font-bold underline">Back to editing</Link>
      </div>
      <div className="mt-8 bg-surface p-6 md:p-10 rounded-[var(--radius-card)]">
        <JobView job={job as unknown as Job} org={job.org} questions={questions} mode="preview" />
      </div>
    </>
  );
}
