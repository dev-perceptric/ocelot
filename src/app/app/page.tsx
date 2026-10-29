import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink, Tag, ToolIntro } from "@/components/ui";
import { currentUser } from "@/lib/supabase/server";
import { OPEN_STAGES, STAGE_LABEL, STAGE_TONE, type Stage } from "@/lib/tracker";
import { AddJob } from "./tracker/AddJob";

export const dynamic = "force-dynamic";

export default async function MySearch() {
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login?next=/app");
  const { data: items } = await supabase.from("tracker_items").select("id, title, company, stage, updated_at").order("updated_at", { ascending: false });

  if (!items?.length) {
    return (
      <ToolIntro
        title="Your next move starts here."
        line="Save a job or add one you found elsewhere. Only you can see your tracker."
        action={<div className="flex flex-wrap gap-3"><AddJob /><ButtonLink href="/jobs" variant="outline">Find jobs</ButtonLink></div>}
      />
    );
  }
  const count = (s: Stage) => items.filter((i) => i.stage === s).length;
  const open = items.filter((i) => (OPEN_STAGES as readonly string[]).includes(i.stage));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-title font-bold">My search</h1>
        <AddJob />
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {OPEN_STAGES.map((s) => (
          <div key={s} className="border border-border bg-surface p-4 rounded-[var(--radius-card)]">
            <dt className="text-meta text-muted">{STAGE_LABEL[s]}</dt>
            <dd className="mt-1 text-title font-bold">{count(s)}</dd>
          </div>
        ))}
      </dl>
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-card font-bold">Recently updated</h2>
          <Link href="/app/tracker" className="font-bold underline">Open tracker</Link>
        </div>
        <ul className="mt-3 divide-y divide-border border border-border bg-surface rounded-[var(--radius-card)]">
          {open.slice(0, 8).map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-4 p-4">
              <Link href={`/app/tracker/${i.id}`} className="min-w-0 hover:underline"><span className="font-bold">{i.title}</span>{i.company ? <span className="ml-2 text-meta text-muted">{i.company}</span> : null}</Link>
              <Tag tone={STAGE_TONE[i.stage as Stage]}>{STAGE_LABEL[i.stage as Stage]}</Tag>
            </li>
          ))}
        </ul>
      </section>
      <p className="mt-6 text-meta text-muted">Only you can see your tracker. Employers cannot access it.</p>
    </>
  );
}
