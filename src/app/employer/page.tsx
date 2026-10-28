import { Tag } from "@/components/ui";
import { currentUser } from "@/lib/supabase/server";
import { CreateCompany } from "./CreateCompany";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: "neutral" | "warning" | "success" | "danger" }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_review: { label: "Pending review", tone: "warning" },
  published: { label: "Published", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
  rejected: { label: "Needs an update", tone: "warning" },
  suspended: { label: "Suspended", tone: "danger" },
};

export default async function EmployerHome() {
  const { supabase, user } = await currentUser();
  const { data: memberships } = await supabase
    .from("org_members").select("role, org:orgs(id, name, slug)").eq("user_id", user!.id);
  const org = (memberships?.[0]?.org ?? null) as unknown as { id: string; name: string; slug: string } | null;

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
              <span className="font-bold">{j.title}</span>
              <Tag tone={STATUS[j.status]?.tone}>{STATUS[j.status]?.label ?? j.status}</Tag>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-body text-muted">No jobs yet.</p>
      )}
    </>
  );
}
