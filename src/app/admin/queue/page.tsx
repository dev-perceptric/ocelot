import { requireAdmin } from "@/lib/admin";
import { createAdmin } from "@/lib/supabase/server";
import { Table, Tag, Td, Th } from "@/components/ui";
import { RetryTask } from "../AdminButtons";
import { when } from "../format";

export const dynamic = "force-dynamic";

// Tasks that failed: stopped for good, or still retrying. Email addresses come from the task itself.
export default async function Queue() {
  await requireAdmin();
  const db = createAdmin();
  const [{ data: failed }, { count: waiting }] = await Promise.all([
    db.from("jobs_queue").select("id, kind, payload, attempts, error, run_at, done_at, created_at")
      .not("error", "is", null).order("created_at", { ascending: false }).limit(50),
    db.from("jobs_queue").select("id", { count: "exact", head: true }).is("done_at", null),
  ]);

  return (
    <>
      <h1 className="text-title font-bold">Queue</h1>
      <p className="mt-2 text-body text-muted">{waiting ?? 0} tasks waiting to run.</p>
      <div className="mt-6">
        {failed?.length ? (
          <Table label="Failed tasks">
            <thead><tr><Th>Task</Th><Th>Status</Th><Th>Error</Th><Th>Created</Th><Th className="w-24"><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {failed.map((t) => {
                const p = t.payload as { to?: string; kind?: string };
                const stopped = Boolean(t.done_at);
                return (
                  <tr key={t.id}>
                    <Td><span className="font-bold">{p.kind ?? t.kind}</span>{p.to ? <span className="ml-2 text-meta text-muted">{p.to}</span> : null}</Td>
                    <Td><Tag tone={stopped ? "danger" : "warning"}>{stopped ? "Stopped" : `Retrying, try ${t.attempts}`}</Tag></Td>
                    <Td className="max-w-[360px] break-words text-meta">{t.error}</Td>
                    <Td className="whitespace-nowrap text-meta">{when(t.created_at)}</Td>
                    <Td><RetryTask id={t.id} /></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : <p className="text-body text-muted">No failed tasks.</p>}
      </div>
    </>
  );
}
