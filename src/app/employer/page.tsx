import Link from "next/link";
import { ButtonLink, Tag } from "@/components/ui";
import { JOB_STATUS as STATUS } from "@/lib/jobStatus";
import { myOrgs } from "@/lib/org";
import { CreateCompany } from "./CreateCompany";

export const dynamic = "force-dynamic";


export default async function EmployerHome() {
  const { supabase, current: org } = await myOrgs();

  if (!org) {
    return (
      <>
        <h1 className="text-title font-bold">Set up your company</h1>
        <div className="mt-6"><CreateCompany /></div>
      </>
    );
  }

  const { data: jobs } = await supabase.from("jobs").select("id, title, status").eq("org_id", org.id)
    .order("created_at", { ascending: false });

  return (
    <>
      <h1 className="text-title font-bold">{org.name}</h1>
      <h2 className="mt-8 text-card font-bold">Jobs</h2>
      {jobs?.length ? (
        <ul className="mt-4 divide-y divide-border border border-border bg-surface rounded-[var(--radius-card)]">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center justify-between gap-4 p-4">
              <Link href={`/employer/jobs/${j.id}`} className="font-bold hover:underline">{j.title || "Untitled job"}</Link>
              <Tag tone={STATUS[j.status]?.tone}>{STATUS[j.status]?.label ?? j.status}</Tag>
            </li>
          ))}
        </ul>
      ) : (
        <ButtonLink href="/employer/jobs/new" className="mt-4">Post a job</ButtonLink>
      )}
    </>
  );
}
