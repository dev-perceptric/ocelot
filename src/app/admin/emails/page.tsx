import { requireAdmin } from "@/lib/admin";
import { SITE_URL } from "@/lib/env";
import { samples } from "@/lib/email/samples";
import { createAdmin } from "@/lib/supabase/server";
import { Table, Tag, Td, Th } from "@/components/ui";
import { SendSample } from "./SendSample";

export const dynamic = "force-dynamic";

const TONE = { sent: "success", failed: "danger", skipped: "neutral" } as const;

export default async function AdminEmails() {
  await requireAdmin();
  const { data: log } = await createAdmin().from("email_log").select("*").order("created_at", { ascending: false }).limit(25);

  return (
    <div className="flex flex-col gap-12">
      <h1 className="text-title font-bold">Emails</h1>
      {samples(SITE_URL).map((s) => (
        <section key={s.kind} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-card font-bold">{s.name}</h2>
              <p className="text-meta text-muted">{s.email.subject}</p>
            </div>
            <SendSample kind={s.kind} />
          </div>
          <iframe title={`${s.name} preview`} srcDoc={s.email.html} sandbox="" className="h-[520px] w-full border border-border bg-canvas rounded-[var(--radius-card)]" />
        </section>
      ))}
      <section>
        <h2 className="mb-3 text-card font-bold">Recent sends</h2>
        <Table label="Recent sends">
          <thead><tr><Th>When</Th><Th>To</Th><Th>Email</Th><Th>Status</Th></tr></thead>
          <tbody>
            {(log ?? []).map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-meta">{new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "medium", timeStyle: "short" })}</Td>
                <Td>{r.to_email}</Td>
                <Td>{r.kind}</Td>
                <Td><span title={r.error ?? undefined}><Tag tone={TONE[r.status as keyof typeof TONE] ?? "neutral"}>{r.status}</Tag></span></Td>
              </tr>
            ))}
            {!log?.length ? <tr><Td className="text-muted">No emails yet.</Td><Td /><Td /><Td /></tr> : null}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
