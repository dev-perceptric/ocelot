import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Table, Tag, Td, Th } from "@/components/ui";
import { myTimeZone } from "@/lib/myTz";
import { minutesAgo } from "@/lib/when";
import { myOrgs } from "@/lib/org";
import { PACKAGE_LABEL, dollars } from "@/lib/packages";
import { BuyListing, PaymentWait } from "./BuyListing";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

const STATUS = { paid: { label: "Paid", tone: "success" }, refunded: { label: "Refunded", tone: "warning" }, failed: { label: "Not completed", tone: "neutral" } } as const;

export default async function Billing({ searchParams }: { searchParams: Promise<{ paid?: string }> }) {
  const { supabase, user, current } = await myOrgs();
  if (!user || !current) redirect("/employer");
  const { paid } = await searchParams;
  const [{ data: credits }, { data: orders }, { data: settings }, tz] = await Promise.all([
    supabase.from("entitlements").select("package").eq("org_id", current.id).is("job_id", null),
    supabase.from("orders").select("id, created_at, package, amount_cents, currency, status, receipt_url, job:jobs(title)")
      .eq("org_id", current.id).neq("status", "pending").order("created_at", { ascending: false }).limit(50),
    supabase.from("app_settings").select("payments_on").maybeSingle(),
    myTimeZone(supabase, user.id),
  ]);
  const free = new Map<string, number>();
  for (const c of credits ?? []) free.set(c.package, (free.get(c.package) ?? 0) + 1);
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: tz, day: "numeric", month: "short", year: "numeric" });
  // Right after Stripe sends people back, the newest order may still be waiting for the webhook.
  const { count: waiting } = paid ? await supabase.from("orders").select("id", { count: "exact", head: true })
    .eq("org_id", current.id).eq("status", "pending").gt("created_at", minutesAgo(30)).not("stripe_session_id", "is", null) : { count: 0 };

  return (
    <div className="flex max-w-[860px] flex-col gap-10">
      <h1 className="text-title font-bold">Billing</h1>
      {paid && waiting ? <PaymentWait /> : null}
      <section>
        <h2 className="text-card font-bold">Listing credits</h2>
        <p className="mt-2 text-body">{free.size ? [...free].map(([k, n]) => `${n} ${PACKAGE_LABEL[k] ?? k}`).join(", ") : "None left"}</p>
        {settings?.payments_on ? <div className="mt-6"><BuyListing label="Buy listing" /></div> : null}
      </section>
      {orders?.length ? (
        <section>
          <h2 className="mb-3 text-card font-bold">Orders</h2>
          <Table label="Orders">
            <thead><tr><Th>Date</Th><Th>Listing</Th><Th>Amount</Th><Th>Status</Th><Th><span className="sr-only">Receipt</span></Th></tr></thead>
            <tbody>
              {orders.map((o) => {
                const st = STATUS[o.status as keyof typeof STATUS];
                const job = (o.job as unknown as { title: string } | null)?.title;
                return (
                  <tr key={o.id}>
                    <Td className="text-meta">{day(o.created_at)}</Td>
                    <Td>{PACKAGE_LABEL[o.package] ?? o.package}{job ? <span className="block text-meta text-muted">{job}</span> : null}</Td>
                    <Td>{dollars(o.amount_cents, o.currency)}</Td>
                    <Td><Tag tone={st?.tone}>{st?.label ?? o.status}</Tag></Td>
                    <Td className="text-right">{o.receipt_url ? <a href={o.receipt_url} target="_blank" rel="noopener" className="text-meta underline">Receipt</a> : null}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </section>
      ) : null}
    </div>
  );
}
