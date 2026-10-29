import { interviewCutoff } from "@/lib/when";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { myTimeZone } from "@/lib/myTz";
import { currentUser } from "@/lib/supabase/server";
import { AddTask, InterviewList, TaskList, type Interview, type Task } from "./TaskParts";

export const metadata: Metadata = { title: "Tasks" };
export const dynamic = "force-dynamic";

export default async function Tasks() {
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login?next=/app/tasks");
  const tz = await myTimeZone(supabase, user.id);
  const since = interviewCutoff();
  const [{ data: tasks }, { data: interviews }, { data: cards }] = await Promise.all([
    supabase.from("tasks").select("id, title, due_at, done_at, item_id, item:tracker_items(title)").order("due_at", { nullsFirst: false }),
    supabase.from("interviews").select("id, item_id, starts_at, title, meeting_url, notes, item:tracker_items(title)").gte("starts_at", since).order("starts_at"),
    supabase.from("tracker_items").select("id, title").not("stage", "in", "(rejected,withdrawn,archived)").order("updated_at", { ascending: false }),
  ]);
  const t: Task[] = (tasks ?? []).map((x) => ({ ...x, item_title: (x.item as { title: string } | null)?.title ?? null }));
  const iv: Interview[] = (interviews ?? []).map((x) => ({ ...x, item_title: (x.item as { title: string } | null)?.title ?? null }));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-title font-bold">Tasks</h1>
        <AddTask cards={cards ?? []} tz={tz} />
      </div>
      {iv.length ? (
        <section className="mt-8 border border-border bg-surface p-5 rounded-[var(--radius-card)]">
          <h2 className="text-card font-bold">Coming interviews</h2>
          <InterviewList interviews={iv} tz={tz} showJob />
        </section>
      ) : null}
      <section className="mt-8 border border-border bg-surface p-5 rounded-[var(--radius-card)]">
        <TaskList tasks={t} tz={tz} cards={cards ?? []} />
      </section>
      <p className="mt-4 text-meta text-muted">Times are in {tz.replace(/_/g, " ")}. Change it in your profile.</p>
    </>
  );
}
