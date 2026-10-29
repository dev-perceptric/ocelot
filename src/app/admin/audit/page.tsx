import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { createAdmin } from "@/lib/supabase/server";
import { Pagination, Table, Td, Th } from "@/components/ui";
import { when } from "../format";

export const dynamic = "force-dynamic";
const PAGE = 100;

export default async function Audit({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireAdmin();
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const db = createAdmin();
  const { data } = await db.from("audit_events").select("*").order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE);
  const rows = (data ?? []).slice(0, PAGE);
  const actors = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
  const { data: people } = actors.length ? await db.from("profiles").select("id, email").in("id", actors) : { data: [] };
  const who = new Map((people ?? []).map((p) => [p.id, p.email]));
  const link = (table: string | null, id: string | null) =>
    table === "orgs" ? `/admin/companies/${id}` : table === "auth.users" ? `/admin/people/${id}` : table === "jobs_queue" ? "/admin/queue" : null;

  return (
    <>
      <h1 className="text-title font-bold">Audit log</h1>
      <div className="mt-6">
        <Table label="Audit log">
          <thead><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Details</Th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const href = link(r.target_table, r.target_id);
              const detail = Object.entries((r.detail ?? {}) as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v)}`).join(", ");
              return (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap text-meta">{when(r.created_at)}</Td>
                  <Td>{r.actor_id ? who.get(r.actor_id) ?? "Removed account" : "System"}</Td>
                  <Td>{href ? <Link href={href} className="font-bold underline">{r.action}</Link> : <span className="font-bold">{r.action}</span>}</Td>
                  <Td className="text-meta">{detail}</Td>
                </tr>
              );
            })}
            {!rows.length ? <tr><Td className="text-muted">Nothing yet.</Td><Td /><Td /><Td /></tr> : null}
          </tbody>
        </Table>
        <Pagination page={page} hasNext={(data?.length ?? 0) > PAGE} href={(n) => `/admin/audit?page=${n}`} />
      </div>
    </>
  );
}
