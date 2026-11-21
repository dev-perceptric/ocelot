import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Table, Tag, Td, Th } from "@/components/ui";
import { myTimeZone } from "@/lib/myTz";
import { canManageAgency, myOrgs } from "@/lib/org";
import { PACKAGE_LABEL, dollars } from "@/lib/packages";
import { minutesAgo } from "@/lib/when";
import { BuyListing, PaymentWait } from "../../billing/BuyListing";

export const metadata: Metadata = { title: "Agency billing" };
export const dynamic = "force-dynamic";

const STATUS = { paid: { label: "Paid", tone: "success" }, refunded: { label: "Refunded", tone: "warning" }, failed: { label: "Not completed", tone: "neutral" } } as const;

// The agency's listing credits: bought once, spent on any client's job by the agency's staff, after the client's
// own credits.
export default async function AgencyBilling({ searchParams }: { searchParams: Promise<{ paid?: string }> }) {
  const { supabase, user, agency } = await myOrgs();
  if (!user || !agency) redirect("/employer/agency");
  const { paid } = await searchParams;
  const [{ data: credits }, { data: used }, { data: orders }, { data: settings }, tz] = await Promise.all([
    supabase.from("entitlements").select("package").eq("agency_id", agency.id).is("job_id", null),
    supabase.from("entitlements").select("package, used_at, job:jobs(title, org:orgs(name))").eq("agency_id", agency.id)
      .not("job_id", "is", null).order("used_at", { ascending: false }).limit(50),
    supabase.from("orders").select("id, created_at, package, amount_cents, currency, status, receipt_url, job:jobs(title, org:orgs(name))")
      .eq("agency_id", agency.id).neq("status", "pending").order("created_at", { ascending: false }).limit(50),
    supabase.from("app_settings").select("payments_on").maybeSingle(),
    myTimeZone(supabase, user.id),
  ]);
  const free = new Map<string, number>();
  for (const c of credits ?? []) free.set(c.package, (free.get(c.package) ?? 0) + 1);
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: tz, day: "numeric", month: "short", year: "numeric" });
  const jobLine = (j: unknown) => {
    const job = j as { title: string; org: { name: string } | null } | null;
    return job ? `${job.title}${job.org ? `, ${job.org.name}` : ""}` : null;
  };
  const { count: waiting } = paid ? await supabase.from("orders").select("id", { count: "exact", head: true })
    .eq("agency_id", agency.id).eq("status", "pending").gt("created_at", minutesAgo(30)).not("stripe_session_id", "is", null) : { count: 0 };

  return (
    <div className="flex max-w-[860px] flex-col gap-10">
      <h1 className="text-title font-bold">Agency billing</h1>
      {paid && waiting ? <PaymentWait /> : null}
      <section>
        <h2 className="text-card font-bold">Listing credits</h2>
        <p className="mt-2 text-body">{free.size ? [...free].map(([k, n]) => `${n} ${PACKAGE_LABEL[k] ?? k}`).join(", ") : "None left"}</p>
        <p className="mt-2 text-meta text-muted">
          Your staff can use these on any client&apos;s job. A client&apos;s own credits are used first. A client&apos;s own team never uses yours.
        </p>
        {settings?.payments_on && canManageAgency(agency.role) ? <div className="mt-6"><BuyListing label="Buy listing" forAgency /></div> : null}
        {settings?.payments_on && !canManageAgency(agency.role) ? <p className="mt-4 text-body">Agency owners and admins buy credits.</p> : null}
      </section>
      {used?.length ? (
        <section>
          <h2 className="mb-3 text-card font-bold">Used on</h2>
          <Table label="Credits used">
            <thead><tr><Th>Date</Th><Th>Listing</Th><Th>Job</Th></tr></thead>
            <tbody>
              {used.map((u, i) => (
                <tr key={i}>
                  <Td className="text-meta">{u.used_at ? day(u.used_at) : ""}</Td>
                  <Td>{PACKAGE_LABEL[u.package] ?? u.package}</Td>
                  <Td>{jobLine(u.job) ?? <span className="text-muted">A job that was deleted</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      ) : null}
      {orders?.length ? (
        <section>
          <h2 className="mb-3 text-card font-bold">Orders</h2>
          <Table label="Orders">
            <thead><tr><Th>Date</Th><Th>Listing</Th><Th>Amount</Th><Th>Status</Th><Th><span className="sr-only">Receipt</span></Th></tr></thead>
            <tbody>
              {orders.map((o) => {
                const st = STATUS[o.status as keyof typeof STATUS];
                const job = jobLine(o.job);
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
