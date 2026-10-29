import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { placeName } from "@/lib/places";
import { createAdmin } from "@/lib/supabase/server";
import { Table, Tag, Td, Th } from "@/components/ui";
import { PersonActions } from "../../AdminButtons";
import { day, when } from "../../format";

export const dynamic = "force-dynamic";

export default async function Person({ params }: { params: Promise<{ id: string }> }) {
  const { user: me } = await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = createAdmin();
  const [{ data: auth }, { data: p }, { data: orgs }, { data: emails }, { data: admin }] = await Promise.all([
    db.auth.admin.getUserById(id),
    db.from("profiles").select("*").eq("id", id).maybeSingle(),
    db.from("org_members").select("role, org:orgs(id, name)").eq("user_id", id),
    db.from("email_log").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(10),
    db.from("platform_admins").select("user_id").eq("user_id", id).maybeSingle(),
  ]);
  const u = auth.user;
  if (!u) notFound();
  const banned = Boolean(u.banned_until && new Date(u.banned_until) > new Date());

  return (
    <div className="flex flex-col gap-10">
      <div>
        <Link href="/admin/people" className="text-meta underline">People</Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-title font-bold">{p?.full_name || u.email}</h1>
          {banned ? <Tag tone="danger">Sign-in suspended</Tag> : null}
          {admin ? <Tag tone="brand">Admin</Tag> : null}
        </div>
        <p className="mt-2 text-body text-muted">{[u.email, p?.headline, p?.city ? placeName(p.city) : null].filter(Boolean).join(" / ")}</p>
        <p className="mt-1 text-meta text-muted">Joined {day(u.created_at)}, last sign-in {when(u.last_sign_in_at) || "never"}</p>
        {id !== me.id && !admin ? <div className="mt-6"><PersonActions id={id} email={u.email ?? ""} banned={banned} /></div> : null}
      </div>

      <section>
        <h2 className="mb-3 text-card font-bold">Companies</h2>
        {orgs?.length ? (
          <ul className="flex flex-col gap-2">
            {orgs.map((m) => {
              const o = m.org as unknown as { id: string; name: string };
              return <li key={o.id}><Link href={`/admin/companies/${o.id}`} className="font-bold underline">{o.name}</Link> <Tag>{m.role}</Tag></li>;
            })}
          </ul>
        ) : <p className="text-body text-muted">Not in any company.</p>}
      </section>

      <section>
        <h2 className="mb-3 text-card font-bold">Recent emails</h2>
        {emails?.length ? (
          <Table label="Recent emails">
            <thead><tr><Th>When</Th><Th>Email</Th><Th>Status</Th></tr></thead>
            <tbody>{emails.map((e) => <tr key={e.id}><Td className="text-meta">{when(e.created_at)}</Td><Td>{e.kind}</Td><Td><Tag tone={e.status === "sent" ? "success" : e.status === "failed" ? "danger" : "neutral"}>{e.status}</Tag></Td></tr>)}</tbody>
          </Table>
        ) : <p className="text-body text-muted">No emails yet.</p>}
      </section>
    </div>
  );
}
