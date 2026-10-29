import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { createAdmin } from "@/lib/supabase/server";
import { Button, CompanyLogo, inputClass, Pagination, Table, Tag, Td, Th } from "@/components/ui";
import { day } from "../format";

export const dynamic = "force-dynamic";
const PAGE = 50;

export default async function Companies({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireAdmin();
  const { q = "", page: p = "1" } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  let query = createAdmin().from("orgs")
    .select("id, name, slug, logo_url, website, created_at, business_verified_at, email_verified_domain, trusted, suspended_at, org_members(count)")
    .order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE);
  // Commas and brackets would break the filter string, so they're dropped from the search.
  const term = q.trim().replace(/[,()%]/g, " ");
  if (term) query = query.or(`name.ilike.%${term}%,slug.ilike.%${term}%,website.ilike.%${term}%`);
  const { data } = await query;
  const rows = (data ?? []).slice(0, PAGE);

  return (
    <>
      <h1 className="text-title font-bold">Companies</h1>
      <form className="mt-6 flex max-w-[560px] gap-3" role="search">
        <label htmlFor="q" className="sr-only">Search companies</label>
        <input id="q" name="q" defaultValue={q} placeholder="Name, address or website" className={inputClass} />
        <Button type="submit" variant="outline">Search</Button>
      </form>
      <div className="mt-6">
        <Table label="Companies">
          <thead><tr><Th>Company</Th><Th>Members</Th><Th>Labels</Th><Th>Created</Th></tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <Td>
                  <Link href={`/admin/companies/${o.id}`} className="flex items-center gap-3 font-bold hover:underline">
                    <CompanyLogo name={o.name} src={o.logo_url} size={32} />{o.name}
                  </Link>
                </Td>
                <Td>{(o.org_members as unknown as { count: number }[])?.[0]?.count ?? 0}</Td>
                <Td>
                  <span className="flex flex-wrap gap-1">
                    {o.suspended_at ? <Tag tone="danger">Suspended</Tag> : null}
                    {o.business_verified_at ? <Tag tone="success">Company verified</Tag> : null}
                    {o.email_verified_domain ? <Tag tone="info">Email verified</Tag> : null}
                    {o.trusted ? <Tag>Trusted</Tag> : null}
                  </span>
                </Td>
                <Td className="text-meta">{day(o.created_at)}</Td>
              </tr>
            ))}
            {!rows.length ? <tr><Td className="text-muted">No companies match.</Td><Td /><Td /><Td /></tr> : null}
          </tbody>
        </Table>
        <Pagination page={page} hasNext={(data?.length ?? 0) > PAGE} href={(n) => `/admin/companies?q=${encodeURIComponent(q)}&page=${n}`} />
      </div>
    </>
  );
}
