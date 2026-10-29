import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Tabs } from "@/components/Tabs";
import { Pagination, ToolIntro, ButtonLink } from "@/components/ui";
import { HIRING_LABEL, HIRING_STAGES, isHiringStage, type HiringStage } from "@/lib/hiring";
import { myTimeZone } from "@/lib/myTz";
import { myOrgs } from "@/lib/org";
import { readSnapshot } from "@/lib/snapshot";
import { ApplicantTable, JobFilter, type Row } from "./ApplicantTable";

export const metadata: Metadata = { title: "Applicants" };
export const dynamic = "force-dynamic";

const PER_PAGE = 50;

export default async function Applicants({ searchParams }: { searchParams: Promise<{ job?: string; tab?: string; page?: string }> }) {
  const { supabase, user, current } = await myOrgs();
  if (!user || !current) redirect("/employer");
  const sp = await searchParams;
  const job = sp.job && /^[0-9a-f-]{36}$/.test(sp.job) ? sp.job : null;
  const tab = sp.tab && isHiringStage(sp.tab) ? sp.tab : "all";
  const page = Math.max(1, Number(sp.page) || 1);

  let list = supabase.from("applications").select("id, job_id, hiring_stage, submitted_at, snapshot, job:jobs(title)")
    .eq("org_id", current.id).order("submitted_at", { ascending: false }).range((page - 1) * PER_PAGE, page * PER_PAGE);
  let stages = supabase.from("applications").select("hiring_stage").eq("org_id", current.id);
  if (job) { list = list.eq("job_id", job); stages = stages.eq("job_id", job); }
  if (tab !== "all") list = list.eq("hiring_stage", tab);
  const [{ data: rows }, { data: all }, { data: jobs }, tz] = await Promise.all([
    list, stages,
    supabase.from("jobs").select("id, title").eq("org_id", current.id).eq("apply_method", "ocelot").not("published_at", "is", null).order("published_at", { ascending: false }),
    myTimeZone(supabase, user.id),
  ]);

  if (!job && !all?.length) {
    return <ToolIntro title="Applicants show up here" line="When people apply to your jobs on Ocelot, you'll review them, move them through your stages and keep notes with your team."
      action={<ButtonLink href="/employer/jobs">Your jobs</ButtonLink>} />;
  }

  const count = new Map<string, number>();
  for (const a of all ?? []) count.set(a.hiring_stage, (count.get(a.hiring_stage) ?? 0) + 1);
  const qs = (o: { tab?: string; page?: number }) => {
    const p = new URLSearchParams();
    if (job) p.set("job", job);
    if (o.tab && o.tab !== "all") p.set("tab", o.tab);
    if (o.page && o.page > 1) p.set("page", String(o.page));
    const s = p.toString();
    return `/employer/applicants${s ? `?${s}` : ""}`;
  };
  const items = [{ key: "all", label: `All ${all?.length ?? 0}` },
    ...HIRING_STAGES.filter((s) => count.get(s) || s === tab).map((s) => ({ key: s, label: `${HIRING_LABEL[s]} ${count.get(s) ?? 0}` }))];
  const shown: Row[] = (rows ?? []).slice(0, PER_PAGE).map((r) => {
    const s = readSnapshot(r.snapshot);
    return { id: r.id, name: s.name, headline: s.headline, job: (r.job as unknown as { title: string } | null)?.title ?? s.jobTitle ?? "", stage: r.hiring_stage as HiringStage,
      applied: new Date(r.submitted_at).toLocaleDateString("en-GB", { timeZone: tz, day: "numeric", month: "short" }) };
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-title font-bold">Applicants</h1>
        <div className="w-full sm:w-72"><JobFilter jobs={jobs ?? []} value={job} /></div>
      </div>
      <div className="mt-6"><Tabs items={items} current={tab} base="/employer/applicants" href={(k) => qs({ tab: k })} /></div>
      <div className="mt-6">
        {shown.length ? <ApplicantTable key={`${job}-${tab}-${page}`} rows={shown} showJob={!job} /> : <p className="text-body text-muted">No applicants here.</p>}
        <Pagination page={page} hasNext={(rows?.length ?? 0) > PER_PAGE} href={(n) => qs({ tab, page: n })} />
      </div>
    </>
  );
}
