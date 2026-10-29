import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { createAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Counts = Record<string, number>;

export default async function AdminHome() {
  await requireAdmin();
  const { data } = await createAdmin().rpc("admin_counts");
  const c = (data ?? {}) as Counts;
  const groups: { title: string; stats: [string, number, string?][] }[] = [
    { title: "People", stats: [["People", c.people], ["Candidates with a profile", c.candidates], ["Companies", c.companies, "/admin/companies"], ["Company members", c.members]] },
    { title: "Marketplace", stats: [["Live jobs", c.jobs_live], ["Waiting for review", c.jobs_review, "/admin/review"], ["Applications", c.applications], ["Open reports", c.reports_open]] },
    { title: "Running", stats: [["Emails sent today", c.emails_today, "/admin/emails"], ["Emails failed, 7 days", c.emails_failed, "/admin/emails"], ["Failed tasks", c.tasks_failed, "/admin/queue"]] },
  ];
  return (
    <>
      <h1 className="text-title font-bold">Admin</h1>
      {groups.map((g) => (
        <section key={g.title} className="mt-8">
          <h2 className="text-card font-bold">{g.title}</h2>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {g.stats.map(([label, n, href]) => (
              <div key={label} className="border border-border bg-surface p-5 rounded-[var(--radius-card)]">
                <dt className="text-meta text-muted">{href ? <Link href={href} className="underline hover:text-ink">{label}</Link> : label}</dt>
                <dd className="mt-1 text-title font-bold">{(n ?? 0).toLocaleString("en-US")}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </>
  );
}
