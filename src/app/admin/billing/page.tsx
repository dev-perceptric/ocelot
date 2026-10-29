import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { PACKAGE_LABEL, dollars } from "@/lib/packages";
import { createAdmin } from "@/lib/supabase/server";
import { Table, Tag, Td, Th } from "@/components/ui";
import { PaymentsSwitch, RefundOrder } from "../AdminButtons";
import { day } from "../format";

export const dynamic = "force-dynamic";

const STATUS = { pending: { label: "Not paid", tone: "neutral" }, paid: { label: "Paid", tone: "success" }, refunded: { label: "Refunded", tone: "warning" }, failed: { label: "Failed", tone: "danger" } } as const;

export default async function AdminBilling() {
  await requireAdmin();
  const db = createAdmin();
  const [{ data: settings }, { data: orders }] = await Promise.all([
    db.from("app_settings").select("payments_on, updated_at").single(),
    db.from("orders").select("id, created_at, package, amount_cents, currency, status, receipt_url, org_id, org_name, job:jobs(title), entitlements(job:jobs(published_at))")
      .neq("status", "pending").order("created_at", { ascending: false }).limit(100),
  ]);
  const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
  const month = (orders ?? []).filter((o) => o.status === "paid" && new Date(o.created_at) >= since).reduce((n, o) => n + o.amount_cents, 0);

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-title font-bold">Billing</h1>
      <section className="flex flex-col gap-3">
        <h2 className="text-card font-bold">Payments</h2>
        <p className="text-body">{settings?.payments_on ? "On. New jobs need a listing credit to go to review." : "Off. New jobs go to review without a listing credit."}</p>
        <div><PaymentsSwitch on={Boolean(settings?.payments_on)} /></div>
      </section>
      <section>
        <h2 className="text-card font-bold">Orders</h2>
        <p className="mt-1 text-body text-muted">Paid this month: {dollars(month)}</p>
        <div className="mt-3">
          <Table label="Orders">
            <thead><tr><Th>Date</Th><Th>Company</Th><Th>Listing</Th><Th>Amount</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {(orders ?? []).map((o) => {
                const live = (o.entitlements as unknown as { job: { published_at: string | null } | null }[] | null)?.some((e) => e.job?.published_at);
                const job = (o.job as unknown as { title: string } | null)?.title;
                const st = STATUS[o.status as keyof typeof STATUS];
                return (
                  <tr key={o.id}>
                    <Td className="text-meta">{day(o.created_at)}</Td>
                    <Td>{o.org_id ? <Link href={`/admin/companies/${o.org_id}`} className="underline">{o.org_name}</Link> : o.org_name}</Td>
                    <Td>{PACKAGE_LABEL[o.package] ?? o.package}{job ? <span className="block text-meta text-muted">{job}</span> : null}</Td>
                    <Td>{dollars(o.amount_cents, o.currency)}</Td>
                    <Td><Tag tone={st?.tone}>{st?.label ?? o.status}</Tag></Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-3">
                        {o.receipt_url ? <a href={o.receipt_url} target="_blank" rel="noopener" className="text-meta underline">Receipt</a> : null}
                        {o.status === "paid" && !live ? <RefundOrder id={o.id} what={`${dollars(o.amount_cents, o.currency)} to ${o.org_name}`} /> : null}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      </section>
    </div>
  );
}
