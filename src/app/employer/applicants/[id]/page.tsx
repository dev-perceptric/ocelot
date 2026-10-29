import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Tag } from "@/components/ui";
import { HIRING_LABEL, HIRING_TONE, type HiringStage } from "@/lib/hiring";
import { myTimeZone } from "@/lib/myTz";
import { myOrgs } from "@/lib/org";
import { readSnapshot } from "@/lib/snapshot";
import { HiringNotes, StageSelect } from "./Parts";

export const metadata: Metadata = { title: "Applicant" };
export const dynamic = "force-dynamic";


export default async function Applicant({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, user, current } = await myOrgs();
  if (!user || !current) redirect("/employer");
  const { data: app } = await supabase.from("applications").select("*, job:jobs(id, title, slug)").eq("id", id).eq("org_id", current.id).maybeSingle();
  if (!app) notFound();
  const [{ data: notes }, { data: events }, { data: team }, { data: doc }, tz] = await Promise.all([
    supabase.from("application_notes").select("id, author_id, body, created_at").eq("application_id", id).order("created_at"),
    supabase.from("application_events").select("kind, to_stage, actor_id, created_at").eq("application_id", id).order("created_at", { ascending: false }),
    supabase.rpc("team_members", { p_org: current.id }),
    app.resume_id ? supabase.from("documents").select("name").eq("id", app.resume_id).maybeSingle() : Promise.resolve({ data: null }),
    myTimeZone(supabase, user.id),
  ]);
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const s = readSnapshot(app.snapshot);
  const job = app.job as unknown as { id: string; title: string; slug: string } | null;
  const stage = app.hiring_stage as HiringStage;
  const names = new Map((team ?? []).map((m) => [m.user_id, m.full_name || m.email]));
  const who = (uid: string | null) => (uid === app.candidate_id ? s.name : uid ? names.get(uid) ?? "Former teammate" : "");
  const facts = [s.headline, s.place, s.experience, s.languages.length ? s.languages.join(", ") : null, s.salary].filter(Boolean) as string[];

  return (
    <div className="flex max-w-[860px] flex-col gap-8">
      <div>
        <Link href={job ? `/employer/applicants?job=${job.id}` : "/employer/applicants"} className="text-meta underline">Applicants</Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-title font-bold">{s.name}</h1>
          <Tag tone={HIRING_TONE[stage]}>{HIRING_LABEL[stage]}</Tag>
        </div>
        <p className="mt-1 text-body text-muted">
          Applied {when(app.submitted_at)} for {job ? <Link href={`/employer/jobs/${job.id}`} className="underline">{job.title}</Link> : s.jobTitle}
        </p>
      </div>

      <section className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-2 border border-border bg-surface p-5 rounded-[var(--radius-card)]">
          {s.deleted ? <p className="text-body">This person deleted their account. Their details and résumé are gone.</p> : (
            <>
              {facts.map((f) => <p key={f} className="text-body">{f}</p>)}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-body">
                {s.email ? <a href={`mailto:${s.email}`} className="underline">{s.email}</a> : null}
                {s.phone ? <a href={`tel:${s.phone.replace(/[^+0-9]/g, "")}`} className="underline">{s.phone}</a> : null}
                {s.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noopener nofollow" className="underline">{l.label}</a>)}
              </div>
            </>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <StageSelect id={app.id} stage={stage} />
          {doc ? <a href={`/employer/applicants/${app.id}/resume`} className="inline-flex min-h-11 items-center justify-center border border-ink px-5 font-bold rounded-[var(--radius-control)]">Download résumé</a> : null}
        </div>
      </section>

      {s.answers.length ? (
        <section>
          <h2 className="text-card font-bold">Answers</h2>
          <dl className="mt-3 flex flex-col gap-4">
            {s.answers.map((a, i) => (
              <div key={i}>
                <dt className="text-meta font-bold">{a.prompt}</dt>
                <dd className="mt-1 whitespace-pre-line break-words text-body">{a.answer || "No answer"}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {s.note ? (
        <section>
          <h2 className="text-card font-bold">Note from {s.deleted ? "the candidate" : s.name}</h2>
          <p className="mt-2 whitespace-pre-line break-words text-body">{s.note}</p>
        </section>
      ) : null}

      <section className="border-t border-border pt-6">
        <h2 className="text-card font-bold">Team notes</h2>
        <HiringNotes applicationId={app.id} me={user.id} notes={(notes ?? []).map((n) => ({ ...n, author: who(n.author_id), when: when(n.created_at) }))} />
      </section>

      <section className="border-t border-border pt-6">
        <h2 className="mb-3 text-card font-bold">History</h2>
        <ul className="flex flex-col gap-1 text-body">
          {(events ?? []).map((e, i) => (
            <li key={i}>
              <span className="text-meta text-muted">{when(e.created_at)}</span>{" "}
              {e.kind === "submitted" ? "Applied" : e.kind === "withdrawn" ? `${s.name} withdrew` : `${who(e.actor_id)} moved to ${HIRING_LABEL[e.to_stage as HiringStage] ?? e.to_stage}`}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
