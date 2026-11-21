import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { createAdmin } from "@/lib/supabase/server";
import { CompanyLogo, Table, Tag, Td, Th } from "@/components/ui";
import { PACKAGE_LABEL } from "@/lib/packages";
import { AgencyActions, GrantAgencyCredits } from "../../AdminButtons";
import { day, when } from "../../format";

export const dynamic = "force-dynamic";

export default async function Agency({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = createAdmin();
  const { data: agency } = await db.from("agencies").select("*").eq("id", id).maybeSingle();
  if (!agency) notFound();
  const [{ data: staff }, { data: clients }, { data: log }, { data: credits }] = await Promise.all([
    db.from("agency_members").select("role, created_at, user_id, profile:profiles(full_name, email)").eq("agency_id", id).order("created_at"),
    db.from("orgs").select("id, name, logo_url, suspended_at, suspended_by_agency, org_members(count)").eq("agency_id", id).order("name"),
    db.from("audit_events").select("*").eq("target_table", "agencies").eq("target_id", id).order("created_at", { ascending: false }).limit(20),
    db.from("entitlements").select("package").eq("agency_id", id).is("job_id", null),
  ]);
  const ids = (clients ?? []).map((c) => c.id);
  const { data: live } = ids.length ? await db.from("jobs").select("org_id").in("org_id", ids).eq("status", "published") : { data: [] };
  const free = new Map<string, number>();
  for (const c of credits ?? []) free.set(c.package, (free.get(c.package) ?? 0) + 1);
  const detail = (e: { detail: unknown }) => {
    const d = e.detail as Record<string, string> | null;
    return d?.reason ? `: ${d.reason}` : d?.note ? `: ${d.note}` : d?.count ? `: ${d.count}` : "";
  };

  return (
    <div className="flex flex-col gap-10">
      <div>
        <Link href="/admin/agencies" className="text-meta underline">Agencies</Link>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <CompanyLogo name={agency.name} src={agency.logo_url} size={56} />
          <h1 className="text-title font-bold">{agency.name}</h1>
          {agency.suspended_at ? <Tag tone="danger">Suspended</Tag> : null}
          {agency.business_verified_at ? <Tag tone="success">Agency verified</Tag> : null}
        </div>
        <p className="mt-2 text-body text-muted">{[agency.website, `joinocelot.com/agencies/${agency.slug}`].filter(Boolean).join(" / ")}, created {day(agency.created_at)}</p>
        {agency.about ? <p className="mt-3 max-w-[70ch] whitespace-pre-line text-body">{agency.about}</p> : null}
        {agency.suspended_at ? <p className="mt-3 text-body">Suspended {when(agency.suspended_at)}: {agency.suspended_reason}</p> : null}
        {agency.business_verified_at ? <p className="mt-3 text-body">Verified {when(agency.business_verified_at)}: {agency.business_verified_note}</p> : null}
        <div className="mt-6">
          <AgencyActions id={agency.id} name={agency.name} verified={Boolean(agency.business_verified_at)} suspended={Boolean(agency.suspended_at)} />
        </div>
      </div>

      <section>
        <h2 className="text-card font-bold">Listing credits</h2>
        <p className="mt-2 text-body">{free.size ? [...free].map(([k, n]) => `${n} ${PACKAGE_LABEL[k] ?? k}`).join(", ") : "None left"}</p>
        <div className="mt-3"><GrantAgencyCredits agencyId={agency.id} name={agency.name} /></div>
      </section>

      <section>
        <h2 className="mb-3 text-card font-bold">Clients</h2>
        {clients?.length ? (
          <Table label="Clients">
            <thead><tr><Th>Company</Th><Th>Team</Th><Th>Live jobs</Th><Th>Labels</Th></tr></thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <Td><Link href={`/admin/companies/${c.id}`} className="flex items-center gap-3 font-bold hover:underline"><CompanyLogo name={c.name} src={c.logo_url} size={32} />{c.name}</Link></Td>
                  <Td>{(c.org_members as unknown as { count: number }[])?.[0]?.count ? "Has its own team" : "Run by the agency"}</Td>
                  <Td>{(live ?? []).filter((j) => j.org_id === c.id).length}</Td>
                  <Td>{c.suspended_at ? <Tag tone="danger">{c.suspended_by_agency ? "Suspended with the agency" : "Suspended"}</Tag> : null}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <p className="text-body text-muted">No clients yet.</p>}
      </section>

      <section>
        <h2 className="mb-3 text-card font-bold">Staff</h2>
        <Table label="Staff">
          <thead><tr><Th>Person</Th><Th>Role</Th><Th>Joined</Th></tr></thead>
          <tbody>
            {(staff ?? []).map((m) => {
              const p = m.profile as unknown as { full_name: string | null; email: string | null } | null;
              return (
                <tr key={m.user_id}>
                  <Td><Link href={`/admin/people/${m.user_id}`} className="font-bold hover:underline">{p?.full_name || p?.email}</Link>{p?.full_name ? <span className="ml-2 text-meta text-muted">{p.email}</span> : null}</Td>
                  <Td><Tag>{m.role}</Tag></Td>
                  <Td className="text-meta">{day(m.created_at)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </section>

      <section>
        <h2 className="mb-3 text-card font-bold">History</h2>
        {log?.length ? (
          <ul className="flex flex-col gap-2 text-body">
            {log.map((e) => <li key={e.id}><span className="text-meta text-muted">{when(e.created_at)}</span> {e.action}{detail(e)}</li>)}
          </ul>
        ) : <p className="text-body text-muted">No admin actions yet.</p>}
      </section>
    </div>
  );
}
