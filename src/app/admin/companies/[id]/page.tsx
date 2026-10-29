import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { SIZE_LABEL } from "@/lib/company";
import { placeName } from "@/lib/places";
import { createAdmin } from "@/lib/supabase/server";
import { CompanyLogo, Table, Tag, Td, Th } from "@/components/ui";
import { CompanyActions, GrantCredits } from "../../AdminButtons";
import { PACKAGE_LABEL } from "@/lib/packages";
import { day, when } from "../../format";

export const dynamic = "force-dynamic";

export default async function Company({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = createAdmin();
  const { data: org } = await db.from("orgs").select("*").eq("id", id).maybeSingle();
  if (!org) notFound();
  const [{ data: members }, { data: jobs }, { data: log }, { data: credits }] = await Promise.all([
    db.from("org_members").select("role, created_at, user_id, profile:profiles(full_name, email)").eq("org_id", id).order("created_at"),
    db.from("jobs").select("id, title, status, published_at").eq("org_id", id).order("created_at", { ascending: false }),
    db.from("audit_events").select("*").eq("target_table", "orgs").eq("target_id", id).order("created_at", { ascending: false }).limit(20),
    db.from("entitlements").select("package").eq("org_id", id).is("job_id", null),
  ]);
  const free = new Map<string, number>();
  for (const c of credits ?? []) free.set(c.package, (free.get(c.package) ?? 0) + 1);
  const facts = [org.website, org.industry, org.size ? SIZE_LABEL[org.size] : null, (org.office_places ?? []).map(placeName).join(", ")].filter(Boolean);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <Link href="/admin/companies" className="text-meta underline">Companies</Link>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <CompanyLogo name={org.name} src={org.logo_url} size={56} />
          <h1 className="text-title font-bold">{org.name}</h1>
          {org.suspended_at ? <Tag tone="danger">Suspended</Tag> : null}
          {org.business_verified_at ? <Tag tone="success">Company verified</Tag> : null}
          {org.email_verified_domain ? <Tag tone="info">Email verified: {org.email_verified_domain}</Tag> : null}
          {org.trusted ? <Tag>Trusted</Tag> : null}
        </div>
        <p className="mt-2 text-body text-muted">{facts.join(" / ")}</p>
        <p className="mt-1 text-meta text-muted">joinocelot.com/companies/{org.slug}, created {day(org.created_at)}</p>
        {org.suspended_at ? <p className="mt-3 text-body">Suspended {when(org.suspended_at)}: {org.suspended_reason}</p> : null}
        {org.business_verified_at ? <p className="mt-3 text-body">Verified {when(org.business_verified_at)}: {org.business_verified_note}</p> : null}
        <div className="mt-6">
          <CompanyActions id={org.id} name={org.name} verified={Boolean(org.business_verified_at)} trusted={org.trusted} suspended={Boolean(org.suspended_at)} />
        </div>
      </div>

      <section>
        <h2 className="text-card font-bold">Listing credits</h2>
        <p className="mt-2 text-body">{free.size ? [...free].map(([k, n]) => `${n} ${PACKAGE_LABEL[k] ?? k}`).join(", ") : "None left"}</p>
        <div className="mt-3"><GrantCredits orgId={org.id} name={org.name} /></div>
      </section>

      <section>
        <h2 className="mb-3 text-card font-bold">Members</h2>
        <Table label="Members">
          <thead><tr><Th>Person</Th><Th>Role</Th><Th>Joined</Th></tr></thead>
          <tbody>
            {(members ?? []).map((m) => {
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
        <h2 className="mb-3 text-card font-bold">Jobs</h2>
        {jobs?.length ? (
          <Table label="Jobs">
            <thead><tr><Th>Job</Th><Th>Status</Th><Th>Published</Th></tr></thead>
            <tbody>{jobs.map((j) => <tr key={j.id}><Td className="font-bold">{j.title}</Td><Td><Tag>{j.status.replace("_", " ")}</Tag></Td><Td className="text-meta">{day(j.published_at)}</Td></tr>)}</tbody>
          </Table>
        ) : <p className="text-body text-muted">No jobs yet.</p>}
      </section>

      <section>
        <h2 className="mb-3 text-card font-bold">History</h2>
        {log?.length ? (
          <ul className="flex flex-col gap-2 text-body">
            {log.map((e) => <li key={e.id}><span className="text-meta text-muted">{when(e.created_at)}</span> {e.action}{(e.detail as Record<string, string>)?.reason ? `: ${(e.detail as Record<string, string>).reason}` : ""}{(e.detail as Record<string, string>)?.note ? `: ${(e.detail as Record<string, string>).note}` : ""}</li>)}
          </ul>
        ) : <p className="text-body text-muted">No admin actions yet.</p>}
      </section>
    </div>
  );
}
