import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { REPORT_REASONS } from "@/lib/email/templates";
import { createAdmin } from "@/lib/supabase/server";
import { Table, Tag, Td, Th } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { ReportActions } from "../AdminButtons";
import { when } from "../format";

export const dynamic = "force-dynamic";

export default async function Reports({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireAdmin();
  const tab = (await searchParams).tab === "handled" ? "handled" : "open";
  const db = createAdmin();
  let q = db.from("reports").select("*, job:jobs(id, title, slug), org:orgs(id, name)").order("created_at", { ascending: tab === "open" }).limit(100);
  q = tab === "open" ? q.eq("status", "open") : q.neq("status", "open");
  const { data: rows } = await q;
  const reporterIds = [...new Set((rows ?? []).map((r) => r.reporter_id).filter(Boolean))] as string[];
  const { data: people } = reporterIds.length ? await db.from("profiles").select("id, email").in("id", reporterIds) : { data: [] };
  const who = new Map((people ?? []).map((p) => [p.id, p.email]));

  return (
    <>
      <h1 className="text-title font-bold">Reports</h1>
      <div className="mt-6"><Tabs base="/admin/reports" current={tab} items={[{ key: "open", label: "Open" }, { key: "handled", label: "Handled" }]} /></div>
      <div className="mt-6">
        {rows?.length ? (
          <Table label={tab === "open" ? "Open reports" : "Handled reports"}>
            <thead><tr><Th>Job</Th><Th>Reason</Th><Th>From</Th><Th>When</Th><Th className="w-48">{tab === "open" ? <span className="sr-only">Actions</span> : "Outcome"}</Th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const job = r.job as unknown as { id: string; title: string; slug: string } | null;
                const org = r.org as unknown as { id: string; name: string } | null;
                return (
                  <tr key={r.id}>
                    <Td>
                      {job ? <Link href={`/admin/review/${job.id}`} className="font-bold underline">{job.title}</Link> : <span className="text-muted">Job removed</span>}
                      {org ? <> <span className="text-muted">at</span> <Link href={`/admin/companies/${org.id}`} className="underline">{org.name}</Link></> : null}
                    </Td>
                    <Td><Tag tone={r.reason === "scam" || r.reason === "fee_required" ? "danger" : "warning"}>{REPORT_REASONS[r.reason] ?? r.reason}</Tag>{r.details ? <p className="mt-1 max-w-[360px] break-words text-meta">{r.details}</p> : null}</Td>
                    <Td className="text-meta">{r.reporter_id ? who.get(r.reporter_id) ?? "Removed account" : `Visitor${r.contact_email ? `, ${r.contact_email}` : ""}`}</Td>
                    <Td className="whitespace-nowrap text-meta">{when(r.created_at)}</Td>
                    <Td>{tab === "open" ? <ReportActions id={r.id} /> : <span className="text-meta"><Tag>{r.status}</Tag> {r.admin_note}</span>}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : <p className="text-body text-muted">{tab === "open" ? "No open reports." : "No handled reports yet."}</p>}
      </div>
    </>
  );
}
