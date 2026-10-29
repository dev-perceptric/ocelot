import { interviewCutoff } from "@/lib/when";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ToolIntro } from "@/components/ui";
import { currentUser } from "@/lib/supabase/server";
import { type Stage } from "@/lib/tracker";
import { nextStep } from "@/lib/nextStep";
import { myTimeZone } from "@/lib/myTz";
import { AddJob } from "./AddJob";
import { Board, type Card } from "./Board";

export const metadata: Metadata = { title: "Tracker" };
export const dynamic = "force-dynamic";

export default async function Tracker({ searchParams }: { searchParams: Promise<{ view?: string; show?: string }> }) {
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login?next=/app/tracker");
  const { view: v, show } = await searchParams;
  const view = v === "list" ? "list" : "board";
  const closed = show === "closed";
  const since = interviewCutoff();
  const [{ data }, { data: tasks }, { data: interviews }, tz] = await Promise.all([
    supabase.from("tracker_items").select("id, title, company, stage, position, updated_at, applied_at, created_at").order("position"),
    supabase.from("tasks").select("item_id, title, due_at").is("done_at", null).not("item_id", "is", null).order("due_at", { nullsFirst: false }),
    supabase.from("interviews").select("item_id, starts_at").gte("starts_at", since).order("starts_at"),
    myTimeZone(supabase, user.id),
  ]);
  // First (soonest) task and interview per card.
  const firstTask = new Map<string, { title: string; due_at: string | null }>();
  (tasks ?? []).forEach((t) => { if (t.item_id && !firstTask.has(t.item_id)) firstTask.set(t.item_id, t); });
  const firstInterview = new Map<string, string>();
  (interviews ?? []).forEach((i) => { if (!firstInterview.has(i.item_id)) firstInterview.set(i.item_id, i.starts_at); });

  if (!data?.length) {
    return <ToolIntro title="Your next move starts here." line="Save a job or add one you found elsewhere." action={<AddJob />} />;
  }
  const cards: Card[] = data.map((r) => ({
    id: r.id, title: r.title, company: r.company, stage: r.stage as Stage, position: r.position, updated_at: r.updated_at,
    next: nextStep({ stage: r.stage as Stage, applied_at: r.applied_at, created_at: r.created_at, task: firstTask.get(r.id), interview: firstInterview.get(r.id) }, tz),
  }));
  const tab = (href: string, label: string, on: boolean) => (
    <Link href={href} aria-current={on ? "page" : undefined} className={`px-3 py-2 text-meta font-bold rounded-[var(--radius-control)] ${on ? "bg-ink text-surface" : "hover:bg-canvas"}`}>{label}</Link>
  );
  const q = (o: { view?: string; show?: string }) => {
    const s = new URLSearchParams();
    if ((o.view ?? view) === "list") s.set("view", "list");
    if ((o.show ?? (closed ? "closed" : "")) === "closed") s.set("show", "closed");
    return `/app/tracker${s.size ? `?${s}` : ""}`;
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-title font-bold">Tracker</h1>
        <AddJob />
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="View" className="flex gap-1 border border-border bg-surface p-1 rounded-[var(--radius-control)]">
          {tab(q({ view: "board" }), "Board", view === "board")}
          {tab(q({ view: "list" }), "List", view === "list")}
        </nav>
        <Link href={q({ show: closed ? "" : "closed" })} className="text-meta underline">{closed ? "Back to open jobs" : `Closed (${cards.filter((c) => ["rejected", "withdrawn", "archived"].includes(c.stage)).length})`}</Link>
      </div>
      <div className="mt-6"><Board cards={cards} view={view} closed={closed} /></div>
      <p className="mt-6 text-meta text-muted">Only you can see your tracker. Employers cannot access it.</p>
    </>
  );
}
