import type { Metadata } from "next";
import { Tag } from "@/components/ui";
import { canManageAgency, myOrgs } from "@/lib/org";
import { minutesAgo } from "@/lib/when";
import { AgencyForm } from "./AgencyForm";
import { AgencyClients, type Client, type ClientRequest } from "./AgencyClients";
import { CreateAgency } from "./CreateAgency";

export const metadata: Metadata = { title: "Agency" };
export const dynamic = "force-dynamic";

export default async function AgencyPage() {
  const { supabase, agency } = await myOrgs();

  if (!agency) {
    return (
      <div className="flex max-w-[640px] flex-col gap-4">
        <h1 className="text-title font-bold">Set up a recruiting agency</h1>
        <p className="text-body">
          Run hiring for several client companies from one place. Your recruiters see every client&apos;s jobs and applicants.
          Each job says it&apos;s posted by your agency for the client, so candidates always know who receives their application.
        </p>
        <p className="text-body text-muted">Agencies never charge candidates. New agencies&apos; jobs go through review like any first-time company.</p>
        <div className="mt-2"><CreateAgency /></div>
      </div>
    );
  }

  const since = minutesAgo(30 * 24 * 60); // answered requests stay listed for 30 days
  const [{ data: row }, { data: orgs }, { data: requests }] = await Promise.all([
    supabase.from("agencies").select("*").eq("id", agency.id).single(),
    supabase.from("orgs").select("id, name, slug, logo_url").eq("agency_id", agency.id).order("name"),
    supabase.from("agency_client_requests").select("id, org_name, created_at, answered_at, accepted").eq("agency_id", agency.id)
      .or(`answered_at.is.null,answered_at.gt.${since}`).order("created_at", { ascending: false }),
  ]);
  const ids = (orgs ?? []).map((o) => o.id);
  const [{ data: live }, { data: teams }] = ids.length
    ? await Promise.all([
        supabase.from("jobs").select("org_id").in("org_id", ids).eq("status", "published"),
        supabase.from("org_members").select("org_id").in("org_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const count = (rows: { org_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.org_id === id).length;
  const clients: Client[] = (orgs ?? []).map((o) => ({ ...o, liveJobs: count(live, o.id), ownTeam: count(teams, o.id) > 0 }));

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-title font-bold">{agency.name}</h1>
          <Tag>Agency</Tag>
          {row?.business_verified_at ? <Tag tone="success">Agency verified</Tag> : null}
        </div>
        {agency.suspended ? (
          <p className="border border-danger bg-danger-bg p-4 text-body text-danger rounded-[var(--radius-card)]" role="alert">
            Ocelot suspended this agency, and its clients&apos; jobs are hidden. Email hello@joinocelot.com to talk about it.
          </p>
        ) : null}
      </div>

      <AgencyClients
        agency={agency.name}
        role={agency.role}
        clients={clients}
        requests={(requests ?? []) as ClientRequest[]}
        suspended={agency.suspended}
      />

      {row ? (
        <AgencyForm
          canEdit={canManageAgency(agency.role)}
          values={{ id: row.id, name: row.name, slug: row.slug, website: row.website ?? "", about: row.about ?? "", logo_url: row.logo_url }}
        />
      ) : null}
    </div>
  );
}
