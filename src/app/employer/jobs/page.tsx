import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink, Table, Tag, Td, Th, ToolIntro } from "@/components/ui";
import { JOB_STATUS } from "@/lib/jobStatus";
import { myOrgs } from "@/lib/org";

export const metadata: Metadata = { title: "Jobs" };
export const dynamic = "force-dynamic";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");

export default async function Jobs() {
  const { supabase, current } = await myOrgs();
  if (!current) redirect("/employer");
  const { data: jobs } = await supabase.from("jobs").select("id, title, status, updated_at, published_at, expires_at, review_note")
    .eq("org_id", current.id).order("updated_at", { ascending: false });

  if (!jobs?.length) {
    return <ToolIntro title="Post your first job" line="Write the role, where you can hire from and the pay. Ocelot reviews it, then it goes live for 30 days." action={<ButtonLink href="/employer/jobs/new">Post a job</ButtonLink>} />;
  }
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-title font-bold">Jobs</h1>
        <ButtonLink href="/employer/jobs/new">Post a job</ButtonLink>
      </div>
      <div className="mt-6">
        <Table label="Jobs">
          <thead><tr><Th>Job</Th><Th>Status</Th><Th>Live until</Th><Th>Updated</Th></tr></thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <Td><Link href={`/employer/jobs/${j.id}`} className="font-bold hover:underline">{j.title || "Untitled job"}</Link></Td>
                <Td><Tag tone={JOB_STATUS[j.status]?.tone}>{JOB_STATUS[j.status]?.label ?? j.status}</Tag></Td>
                <Td className="text-meta">{j.status === "published" ? day(j.expires_at) : ""}</Td>
                <Td className="text-meta">{day(j.updated_at)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  );
}
