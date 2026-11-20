"use client";

import { ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { JobCard, type CardState } from "@/components/JobCard";
import { JobDescription } from "@/components/JobDescription";
import { CompanyLogo, IconButton, Loading, Tag } from "@/components/ui";
import { CATEGORY, EMPLOYMENT, SENIORITY, formatSalary, formatWhere, postedAgo } from "@/lib/jobs";
import type { JobWithOrg } from "@/lib/queries";
import { roleName } from "@/lib/taxonomy";
import { ApplyButton, OcelotApply, SaveButton } from "./[slug]/SaveApply";
import { jobPanel, type PanelJob } from "./actions";

// Find jobs on a wide screen works like a mail app: the list on the left, the job open on the right. The open job is
// in the address (?job=slug), so it can be shared and the back button works. Up and down arrows (or j and k) move
// through the list; Esc closes the panel. On a phone, a job opens its own page.
const WIDE = "(min-width: 1024px)";

function setJobParam(slug: string | null, replace = false) {
  const url = new URL(window.location.href);
  if (slug) url.searchParams.set("job", slug);
  else url.searchParams.delete("job");
  window.history[replace ? "replaceState" : "pushState"](null, "", url.pathname + url.search);
}

export function JobList({ jobs, states, signedIn }: { jobs: JobWithOrg[]; states: Record<string, CardState>; signedIn: boolean }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const [wide, setWide] = useState(false);
  // Closing the panel holds for this search only: a new search opens it again.
  const others = new URLSearchParams(params);
  others.delete("job");
  const listKey = `${pathname}?${others}`;
  const [closedFor, setClosedFor] = useState<string | null>(null);
  const closed = closedFor === listKey;
  const setClosed = (on: boolean) => setClosedFor(on ? listKey : null);
  const asked = params.get("job");
  const open = wide && !closed && jobs.length ? (asked ?? jobs[0].slug) : null;
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const select = useCallback((slug: string, replace = false) => {
    setClosedFor(null);
    setJobParam(slug, replace);
    // Focus follows the open job, so keyboard focus and the panel never point at different jobs.
    const link = listRef.current?.querySelector<HTMLAnchorElement>(`[data-slug="${slug}"] h3 a`);
    link?.focus({ preventScroll: true });
    link?.closest("[data-slug]")?.scrollIntoView({ block: "nearest" });
  }, []);

  useEffect(() => {
    if (!wide) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && (t.closest("input, textarea, select, [contenteditable], [role=dialog], [role=listbox], [data-panel]")))) return;
      if (e.key === "Escape" && open) { setClosedFor(listKey); setJobParam(null, true); return; }
      const down = e.key === "ArrowDown" || e.key === "j", up = e.key === "ArrowUp" || e.key === "k";
      if (!down && !up) return;
      const i = Math.max(0, jobs.findIndex((j) => j.slug === open));
      const next = jobs[Math.min(jobs.length - 1, Math.max(0, i + (down ? 1 : -1)))];
      if (next && next.slug !== open) { e.preventDefault(); select(next.slug, true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wide, open, jobs, select, listKey]);

  return (
    <div className={`mt-4 grid gap-6 ${open ? "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : ""}`}>
      <div ref={listRef} className={`grid content-start gap-4 ${open ? "" : "md:grid-cols-1"}`}>
        {jobs.map((job) => (
          <div key={job.id} data-slug={job.slug}>
            <JobCard job={job} company={job.org?.name ?? ""} logo={job.org?.logo_url} state={states[job.id] ?? null} signedIn={signedIn}
              selected={open === job.slug}
              onOpen={(e) => {
                if (!window.matchMedia(WIDE).matches || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                select(job.slug);
              }} />
          </div>
        ))}
      </div>
      {open ? (
        <aside aria-label="Job details" className="hidden lg:block">
          <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto overscroll-contain border border-border bg-surface rounded-[var(--radius-card)]">
            <JobPanel slug={open} onClose={() => { setClosed(true); setJobParam(null, true); }} />
          </div>
        </aside>
      ) : null}
    </div>
  );
}

const cache = new Map<string, Promise<PanelJob | null>>();

function JobPanel({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [data, setData] = useState<{ slug: string; job: PanelJob | null } | null>(null);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    if (!cache.has(slug)) cache.set(slug, jobPanel(slug).catch(() => { cache.delete(slug); return null; }));
    cache.get(slug)!.then((job) => { if (live) setData({ slug, job }); });
    top.current?.parentElement?.scrollTo({ top: 0 });
    return () => { live = false; };
  }, [slug]);

  const loaded = data?.slug === slug ? data.job : undefined;
  return (
    <div ref={top} className="p-6 md:p-8" aria-live="polite" aria-busy={loaded === undefined}>
      {loaded === undefined ? (
        <PanelSkeleton />
      ) : loaded === null ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-card font-bold">This job isn&apos;t available.</p>
          <p className="text-body text-muted">It may have closed. Pick another job from the list.</p>
        </div>
      ) : (
        <PanelBody p={loaded} onClose={onClose} />
      )}
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div role="status" aria-label="Loading job" className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="size-10 animate-pulse bg-canvas motion-reduce:animate-none rounded-[var(--radius-control)]" />
        <div className="h-5 w-40 animate-pulse bg-canvas motion-reduce:animate-none rounded-[var(--radius-control)]" />
      </div>
      <div className="h-8 w-3/4 animate-pulse bg-canvas motion-reduce:animate-none rounded-[var(--radius-control)]" />
      <div className="flex gap-3">
        <div className="h-11 w-48 animate-pulse bg-canvas motion-reduce:animate-none rounded-[var(--radius-control)]" />
        <div className="h-11 w-32 animate-pulse bg-canvas motion-reduce:animate-none rounded-[var(--radius-control)]" />
      </div>
      <Loading lines={6} />
    </div>
  );
}

function PanelBody({ p, onClose }: { p: PanelJob; onClose: () => void }) {
  const { job, org, questions } = p;
  const salary = formatSalary(job);
  const live = job.status === "published";
  const facts = [
    job.role ? roleName(job.role) : job.category && CATEGORY[job.category],
    job.employment_type && EMPLOYMENT[job.employment_type],
    job.seniority && SENIORITY[job.seniority],
  ].filter(Boolean) as string[];
  const props = {
    jobId: job.id, slug: job.slug, title: job.title, company: org.name, applyUrl: job.apply_method === "external" ? job.apply_url : null,
    signedIn: p.signedIn, card: p.card,
  };
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <CompanyLogo name={org.name} src={org.logo_url} size={40} />
          <Link href={`/companies/${org.slug}`} className="text-body font-bold underline">{org.name}</Link>
          {org.business_verified_at ? <Tag tone="success">Company verified</Tag> : null}
        </div>
        <div className="-mr-3 -mt-3 flex shrink-0">
          <Link href={`/jobs/${job.slug}`} aria-label="Open the full job page" title="Open the full job page"
            className="flex size-11 items-center justify-center hover:bg-canvas rounded-[var(--radius-control)]">
            <ExternalLink size={18} strokeWidth={1.75} aria-hidden />
          </Link>
          <IconButton label="Close" onClick={onClose}><X size={20} strokeWidth={1.75} aria-hidden /></IconButton>
        </div>
      </div>
      <h2 className="mt-4 text-section-sm font-bold">
        <Link href={`/jobs/${job.slug}`} className="hover:underline">{job.title}</Link>
      </h2>
      <p className="mt-2 text-body">{formatWhere(job)}</p>
      {salary ? <p className="mt-1 text-body font-bold">{salary}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {facts.map((f) => <Tag key={f}>{f}</Tag>)}
        {!live ? <Tag>This role has closed</Tag> : null}
      </div>
      {live ? (
        <div className="sticky top-0 z-10 -mx-6 mt-5 flex flex-wrap items-center gap-3 border-b border-border bg-surface px-6 py-3 md:-mx-8 md:px-8">
          {job.apply_method === "ocelot" ? <OcelotApply slug={job.slug} signedIn={p.signedIn} applied={p.applied} /> : <ApplyButton {...props} hint={false} />}
          <SaveButton {...props} />
          {job.published_at ? <span className="text-meta text-muted">Posted {postedAgo(job.published_at).toLowerCase()}</span> : null}
        </div>
      ) : null}
      <div className="mt-6">
        <JobDescription text={job.description} />
      </div>
      {questions.length && job.apply_method === "ocelot" ? (
        <section className="mt-8">
          <h3 className="text-card font-bold">Questions you&apos;ll answer when you apply</h3>
          <ol className="mt-3 list-decimal pl-6 text-body">{questions.map((q) => <li key={q} className="mt-1">{q}</li>)}</ol>
        </section>
      ) : null}
      <p className="mt-8"><Link href={`/jobs/${job.slug}`} className="text-body font-bold underline">Open the full job page</Link></p>
    </>
  );
}
