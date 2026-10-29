import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { PROVIDERS, type Provider } from "@/lib/ats/boards";
import { countryName } from "@/lib/places";
import { createAdmin } from "@/lib/supabase/server";
import { Table, Tag, Td, Th } from "@/components/ui";
import { when } from "../format";
import { AddSource, LookFor, SourceActions } from "./SourceParts";

export const dynamic = "force-dynamic";

export default async function AdminSources() {
  await requireAdmin();
  const db = createAdmin();
  const [{ data: sources }, { data: orgs }, { data: live }, { count: names }, { count: unchecked }, { data: settings }] = await Promise.all([
    db.from("job_sources").select("*, org:orgs(id, name)").order("created_at", { ascending: false }),
    db.from("orgs").select("id, name").order("name").limit(1000),
    db.from("jobs").select("source_id").eq("status", "published").not("source_id", "is", null),
    db.from("board_candidates").select("slug", { count: "exact", head: true }).eq("skip", false),
    db.from("board_candidates").select("slug", { count: "exact", head: true }).eq("skip", false).is("checked_at", null),
    db.from("app_settings").select("last_cron_at, last_cron_result").single(),
  ]);
  const count = new Map<string, number>();
  for (const j of live ?? []) count.set(j.source_id!, (count.get(j.source_id!) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-title font-bold">Job boards</h1>
        <div className="flex flex-wrap gap-3"><LookFor /><AddSource orgs={orgs ?? []} /></div>
      </div>
      <p className="text-body text-muted">
        {sources?.length ?? 0} boards, {(live ?? []).length} live jobs. Ocelot checks {names ?? 0} company names for a job board once a week{unchecked ? ` (${unchecked} not checked yet)` : ""}, and every board every 6 hours.
      </p>
      <p className={`text-meta ${settings?.last_cron_at ? "text-muted" : "text-danger"}`}>
        {settings?.last_cron_at ? `Last hourly run: ${when(settings.last_cron_at)}. ${settings.last_cron_result ?? ""}` : "The hourly run hasn't come in yet. Check the worker: fly logs -a ocelot-worker"}
      </p>
      {sources?.length ? (
        <Table label="Job boards">
          <thead><tr><Th>Board</Th><Th>Company</Th><Th className="hidden md:table-cell">Imports</Th><Th>Live jobs</Th><Th className="hidden md:table-cell">Last sync</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
          <tbody>
            {sources.map((s) => {
              const org = s.org as unknown as { id: string; name: string } | null;
              return (
                <tr key={s.id}>
                  <Td>
                    <span className="font-bold">{PROVIDERS[s.provider as Provider]?.name ?? s.provider}</span> {s.board}
                    {!s.active ? <span className="ml-2"><Tag>Paused</Tag></span> : null}
                  </Td>
                  <Td>{org ? <Link href={`/admin/companies/${org.id}`} className="underline">{org.name}</Link> : ""}</Td>
                  <Td className="hidden text-meta md:table-cell">{s.niche_only ? "Our roles" : "All roles"} in {s.countries.map(countryName).join(", ")}</Td>
                  <Td>{count.get(s.id) ?? 0}{s.last_seen !== null ? <span className="block text-meta text-muted">of {s.last_seen} on the board</span> : null}</Td>
                  <Td className="hidden text-meta md:table-cell">
                    {s.last_synced_at ? when(s.last_synced_at) : "Not yet"}
                    {s.last_error ? <span className="block text-danger">{s.last_error}</span> : null}
                  </Td>
                  <Td className="text-right"><SourceActions id={s.id} name={`${PROVIDERS[s.provider as Provider]?.name ?? s.provider} ${s.board}`} active={s.active} /></Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : <p className="text-body text-muted">No job boards yet.</p>}
    </div>
  );
}
