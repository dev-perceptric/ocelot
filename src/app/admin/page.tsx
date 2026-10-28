import { createAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

// The full admin overview comes in Milestone 1, part E. For now: the headline counts.
export default async function AdminHome() {
  await requireAdmin();
  const db = createAdmin();
  const count = async (table: "profiles" | "orgs" | "jobs" | "applications") =>
    (await db.from(table).select("*", { count: "exact", head: true })).count ?? 0;
  const [people, companies, jobs, applications] = await Promise.all([
    count("profiles"), count("orgs"), count("jobs"), count("applications"),
  ]);
  const stats = [["People", people], ["Companies", companies], ["Jobs", jobs], ["Applications", applications]] as const;
  return (
    <>
      <h1 className="text-title font-bold">Admin</h1>
      <dl className="mt-6 grid gap-4 sm:grid-cols-4">
        {stats.map(([label, n]) => (
          <div key={label} className="border border-border bg-surface p-5 rounded-[var(--radius-card)]">
            <dt className="text-meta text-muted">{label}</dt>
            <dd className="mt-1 text-title font-bold">{n.toLocaleString("en-US")}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
