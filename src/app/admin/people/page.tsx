import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { createAdmin } from "@/lib/supabase/server";
import { Button, inputClass, Pagination, Table, Tag, Td, Th } from "@/components/ui";
import { day } from "../format";

export const dynamic = "force-dynamic";
const PAGE = 50;

export default async function People({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireAdmin();
  const { q = "", page: p = "1" } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  let query = createAdmin().from("profiles").select("id, email, full_name, intent, created_at")
    .order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE);
  const term = q.trim().replace(/[,()%]/g, " ");
  if (term) query = query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
  const { data } = await query;
  const rows = (data ?? []).slice(0, PAGE);

  return (
    <>
      <h1 className="text-title font-bold">People</h1>
      <form className="mt-6 flex max-w-[560px] gap-3" role="search">
        <label htmlFor="q" className="sr-only">Search people</label>
        <input id="q" name="q" defaultValue={q} placeholder="Email or name" className={inputClass} />
        <Button type="submit" variant="outline">Search</Button>
      </form>
      <div className="mt-6">
        <Table label="People">
          <thead><tr><Th>Person</Th><Th>Here to</Th><Th>Joined</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td><Link href={`/admin/people/${r.id}`} className="font-bold hover:underline">{r.full_name || r.email}</Link>{r.full_name ? <span className="ml-2 text-meta text-muted">{r.email}</span> : null}</Td>
                <Td>{r.intent ? <Tag>{r.intent === "employer" ? "Hire" : "Find a job"}</Tag> : <span className="text-meta text-muted">Not answered</span>}</Td>
                <Td className="text-meta">{day(r.created_at)}</Td>
              </tr>
            ))}
            {!rows.length ? <tr><Td className="text-muted">No people match.</Td><Td /><Td /></tr> : null}
          </tbody>
        </Table>
        <Pagination page={page} hasNext={(data?.length ?? 0) > PAGE} href={(n) => `/admin/people?q=${encodeURIComponent(q)}&page=${n}`} />
      </div>
    </>
  );
}
