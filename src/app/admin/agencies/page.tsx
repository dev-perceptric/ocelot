import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { createAdmin } from "@/lib/supabase/server";
import { Button, CompanyLogo, inputClass, Pagination, Table, Tag, Td, Th } from "@/components/ui";
import { day } from "../format";

export const dynamic = "force-dynamic";
const PAGE = 50;

export default async function Agencies({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireAdmin();
  const { q = "", page: p = "1" } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  let query = createAdmin().from("agencies")
    .select("id, name, slug, logo_url, created_at, business_verified_at, suspended_at, agency_members(count), orgs(count)")
    .order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE);
  // Commas and brackets would break the filter string, so they're dropped from the search.
  const term = q.trim().replace(/[,()%]/g, " ");
  if (term) query = query.or(`name.ilike.%${term}%,slug.ilike.%${term}%,website.ilike.%${term}%`);
  const { data } = await query;
  const rows = (data ?? []).slice(0, PAGE);
  const count = (v: unknown) => (v as { count: number }[] | null)?.[0]?.count ?? 0;

  return (
    <>
      <h1 className="text-title font-bold">Agencies</h1>
      <p className="mt-2 text-body text-muted">Recruiting agencies and the clients they post for. Their clients&apos; first jobs go through Review like any new company.</p>
      <form className="mt-6 flex max-w-[560px] gap-3" role="search">
        <label htmlFor="q" className="sr-only">Search agencies</label>
        <input id="q" name="q" defaultValue={q} placeholder="Name, address or website" className={inputClass} />
        <Button type="submit" variant="outline">Search</Button>
      </form>
      <div className="mt-6">
        <Table label="Agencies">
          <thead><tr><Th>Agency</Th><Th>Staff</Th><Th>Clients</Th><Th>Labels</Th><Th>Created</Th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <Td>
                  <Link href={`/admin/agencies/${a.id}`} className="flex items-center gap-3 font-bold hover:underline">
                    <CompanyLogo name={a.name} src={a.logo_url} size={32} />{a.name}
                  </Link>
                </Td>
                <Td>{count(a.agency_members)}</Td>
                <Td>{count(a.orgs)}</Td>
                <Td>
                  <span className="flex flex-wrap gap-1">
                    {a.suspended_at ? <Tag tone="danger">Suspended</Tag> : null}
                    {a.business_verified_at ? <Tag tone="success">Agency verified</Tag> : null}
                  </span>
                </Td>
                <Td className="text-meta">{day(a.created_at)}</Td>
              </tr>
            ))}
            {!rows.length ? <tr><Td className="text-muted">No agencies match.</Td><Td /><Td /><Td /><Td /></tr> : null}
          </tbody>
        </Table>
        <Pagination page={page} hasNext={(data?.length ?? 0) > PAGE} href={(n) => `/admin/agencies?q=${encodeURIComponent(q)}&page=${n}`} />
      </div>
    </>
  );
}
