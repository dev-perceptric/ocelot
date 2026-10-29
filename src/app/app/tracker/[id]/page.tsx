import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Tag } from "@/components/ui";
import { currentUser } from "@/lib/supabase/server";
import { cleanContacts, STAGE_LABEL, STAGE_TONE, type Stage } from "@/lib/tracker";
import { CardDanger, Contacts, Details, Notes, StagePicker } from "./CardParts";
import { AddInterview, AddTask, InterviewList, TaskList } from "../../tasks/TaskParts";
import { myTimeZone } from "@/lib/myTz";

export const metadata: Metadata = { title: "Tracker" };
export const dynamic = "force-dynamic";

const EVENT: Record<string, (d: Record<string, string>) => string> = {
  created: (d) => `Added${d.from_ocelot ? " from Ocelot" : ""}`,
  stage: (d) => `Moved from ${STAGE_LABEL[d.from as Stage] ?? d.from} to ${STAGE_LABEL[d.to as Stage] ?? d.to}`,
  notes: () => "Notes updated",
  interview: (d) => `Interview added${d.title ? `: ${d.title}` : ""}`,
};
const HIRING: Record<string, string> = { new: "Received", interviewing: "Invited to interview", offer: "Offer", hired: "Hired", rejected: "Not moving forward", withdrawn: "Withdrawn" };

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, user } = await currentUser();
  if (!user) redirect(`/login?next=/app/tracker/${id}`);
  const { data: c } = await supabase.from("tracker_items").select("*, job:jobs(slug, status)").eq("id", id).maybeSingle();
  if (!c) notFound();
  const tz = await myTimeZone(supabase, user.id);
  const [{ data: events }, { data: updates }, { data: tasks }, { data: interviews }] = await Promise.all([
    supabase.from("tracker_events").select("kind, detail, created_at").eq("item_id", id).order("created_at", { ascending: false }).limit(50),
    c.application_id
      ? supabase.from("application_events").select("kind, to_stage, created_at").eq("application_id", c.application_id).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { kind: string; to_stage: string | null; created_at: string }[] }),
    supabase.from("tasks").select("id, title, due_at, done_at, item_id").eq("item_id", id),
    supabase.from("interviews").select("id, item_id, starts_at, title, meeting_url, notes").eq("item_id", id),
  ]);
  const job = c.job as { slug: string; status: string } | null;
  const stage = c.stage as Stage;
  // Notes update on every save; the history shows the latest one only.
  const history = (events ?? []).filter((e, i, all) => e.kind !== "notes" || all.findIndex((x) => x.kind === "notes") === i);
  const day = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex max-w-[860px] flex-col gap-10">
      <div>
        <Link href="/app/tracker" className="text-meta underline">Tracker</Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="break-words text-title font-bold">{c.title}</h1>
          <Tag tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Tag>
        </div>
        <p className="mt-1 text-body text-muted">{[c.company, c.location, c.salary].filter(Boolean).join(" / ")}</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <StagePicker id={c.id} stage={stage} />
          {job ? <Link href={`/jobs/${job.slug}`} className="font-bold underline">View the listing on Ocelot</Link> : null}
          {c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="font-bold underline">Open the job link</a> : null}
        </div>
      </div>

      {c.application_id ? (
        <section className="border border-border bg-surface p-5 rounded-[var(--radius-card)]">
          <h2 className="text-card font-bold">Updates from the company</h2>
          <ul className="mt-3 flex flex-col gap-1 text-body">
            {(updates ?? []).map((u, i) => <li key={i}><span className="text-meta text-muted">{day(u.created_at)}</span> {u.kind === "submitted" ? "Application sent" : HIRING[u.to_stage ?? ""] ?? u.to_stage}</li>)}
          </ul>
          <p className="mt-3 text-meta text-muted">The company&apos;s updates never change your own stage.</p>
        </section>
      ) : null}

      <section className="grid gap-8 md:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between gap-3"><h2 className="text-card font-bold">Interviews</h2><AddInterview itemId={c.id} tz={tz} /></div>
          <InterviewList interviews={interviews ?? []} tz={tz} />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-3"><h2 className="text-card font-bold">Tasks</h2><AddTask itemId={c.id} tz={tz} /></div>
          <TaskList tasks={tasks ?? []} tz={tz} showJob={false} groups={false} />
        </div>
      </section>
      <section><Notes id={c.id} initial={c.notes} /></section>
      <section className="border-t border-border pt-6"><h2 className="mb-4 text-card font-bold">Details</h2><Details id={c.id} values={{ title: c.title, company: c.company, url: c.url ?? "", location: c.location ?? "", salary: c.salary ?? "" }} /></section>
      <section className="border-t border-border pt-6"><h2 className="mb-4 text-card font-bold">Contacts</h2><Contacts id={c.id} initial={cleanContacts(c.contacts)} /></section>
      <section className="border-t border-border pt-6">
        <h2 className="mb-3 text-card font-bold">History</h2>
        <ul className="flex flex-col gap-1 text-body">
          {history.map((e, i) => <li key={i}><span className="text-meta text-muted">{day(e.created_at)}</span> {(EVENT[e.kind] ?? (() => e.kind))(e.detail as Record<string, string>)}</li>)}
        </ul>
      </section>
      <section className="border-t border-border pt-6"><CardDanger id={c.id} stage={stage} /></section>
    </div>
  );
}
