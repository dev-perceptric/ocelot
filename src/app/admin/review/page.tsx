import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { createAdmin } from "@/lib/supabase/server";
import { Table, Td, Th } from "@/components/ui";
import { when } from "../format";

export const dynamic = "force-dynamic";

// Jobs waiting for review, oldest first. Open one to publish it or send it back.
export default async function Review() {
  await requireAdmin();
  const { data: jobs } = await createAdmin().from("jobs").select("id, title, updated_at, org:orgs(name)")
    .eq("status", "pending_review").order("updated_at");
  return (
    <>
      <h1 className="text-title font-bold">Review</h1>
      <div className="mt-6">
        {jobs?.length ? (
          <Table label="Jobs waiting for review">
            <thead><tr><Th>Job</Th><Th>Company</Th><Th>Sent for review</Th></tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}><Td><Link href={`/admin/review/${j.id}`} className="font-bold underline">{j.title}</Link></Td><Td>{(j.org as unknown as { name: string })?.name}</Td><Td className="text-meta">{when(j.updated_at)}</Td></tr>
              ))}
            </tbody>
          </Table>
        ) : <p className="text-body text-muted">No jobs waiting for review.</p>}
      </div>
    </>
  );
}
