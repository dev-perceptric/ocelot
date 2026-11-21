"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "@/components/Toast";
import { CompanyLogo, Tag } from "@/components/ui";
import { EMPLOYMENT, SENIORITY, formatSalary, formatWhere, postedAgo, type Job } from "@/lib/jobs";
import { STAGE_LABEL, type Stage } from "@/lib/tracker";
import { saveJob } from "@/app/app/tracker/actions";

export type CardState = { id: string; stage: string };

// Posted in the last 24 hours.
export function isNew(publishedAt: string | null, now = Date.now()) {
  return Boolean(publishedAt) && now - new Date(publishedAt!).getTime() < 86_400_000;
}

// Order: role, company, where you can be hired from, pay, then short facts and how recent. Promoted listings say so.
// The whole card opens the job; on Find jobs a wide screen opens it in the panel beside the list (onOpen).
// The bookmark saves the job to My search; jobs already there say Saved or their stage.
export function JobCard({ job, company, agency = null, logo, state = null, signedIn = false, selected = false, onOpen }: {
  job: Job;
  company: string;
  agency?: string | null; // the recruiting agency that posted it for the company
  logo?: string | null;
  state?: CardState | null;
  signedIn?: boolean;
  selected?: boolean;
  onOpen?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const [card, setCard] = useState<CardState | null>(state);
  const [pending, start] = useTransition();
  const salary = formatSalary(job);
  const promoted = job.featured_until && new Date(job.featured_until) > new Date();
  const facts = [job.employment_type && EMPLOYMENT[job.employment_type], job.seniority && SENIORITY[job.seniority]].filter(Boolean) as string[];
  const stage = card ? (card.stage === "saved" ? "Saved" : STAGE_LABEL[card.stage as Stage] ?? "In My search") : null;

  return (
    <article
      aria-current={selected ? "true" : undefined}
      className={`group relative flex gap-4 border bg-surface p-5 transition-colors duration-150 hover:border-ink rounded-[var(--radius-card)] md:p-6 ${
        selected ? "border-ink before:absolute before:inset-y-3 before:left-0 before:w-1 before:bg-brand before:rounded-r-[2px]" : "border-border"
      }`}
    >
      <CompanyLogo name={company} src={logo} size={44} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 break-words text-card font-bold">
            {/* The link covers the card, so the whole card opens the job. */}
            <Link href={`/jobs/${job.slug}`} onClick={onOpen} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
              {job.title}
            </Link>
          </h3>
          <div className="relative z-10 -mr-2 -mt-2 flex shrink-0 items-center gap-1">
            {/* On a phone the label goes with the other tags below, so the title keeps room. */}
            {promoted ? <span className="hidden sm:contents"><Tag tone="brand">Promoted listing</Tag></span> : null}
            {!signedIn ? (
              <Link href={`/login?next=/jobs/${job.slug}`} aria-label={`Log in to save ${job.title}`} title="Save job"
                className="flex size-11 items-center justify-center hover:bg-canvas rounded-[var(--radius-control)]">
                <Bookmark size={20} strokeWidth={1.75} aria-hidden />
              </Link>
            ) : card ? (
              <Link href={`/app/tracker/${card.id}`} aria-label={`${stage} in My search: ${job.title}`} title={`${stage} in My search`}
                className="flex size-11 items-center justify-center hover:bg-canvas rounded-[var(--radius-control)]">
                <BookmarkCheck size={20} strokeWidth={1.75} aria-hidden />
              </Link>
            ) : (
              <button type="button" aria-label={`Save ${job.title}`} title="Save job" disabled={pending} aria-busy={pending}
                className="flex size-11 items-center justify-center hover:bg-canvas disabled:text-muted rounded-[var(--radius-control)]"
                onClick={() => start(async () => {
                  const r = await saveJob(job.id);
                  if (r.ok && r.id) { setCard({ id: r.id, stage: "saved" }); toast("Saved to My search"); }
                  else toast(r.message ?? "That didn't save.");
                })}>
                <Bookmark size={20} strokeWidth={1.75} aria-hidden />
              </button>
            )}
          </div>
        </div>
        <p className="text-body">{[company, formatWhere(job)].filter(Boolean).join(" / ")}</p>
        {agency ? <p className="text-meta text-muted">Posted by {agency} for {company}</p> : null}
        {salary ? <p className="text-body font-bold">{salary}</p> : null}
        {facts.length || stage || promoted || job.apply_method === "ocelot" || isNew(job.published_at) ? (
          <div className="mt-1 flex flex-wrap gap-2">
            {promoted ? <span className="contents sm:hidden"><Tag tone="brand">Promoted listing</Tag></span> : null}
            {isNew(job.published_at) ? <Tag tone="info">New</Tag> : null}
            {stage ? <Tag tone={card?.stage === "saved" ? "neutral" : "progress"}>{stage}</Tag> : null}
            {job.apply_method === "ocelot" ? <Tag tone="success">Apply on Ocelot</Tag> : null}
            {facts.map((f) => <Tag key={f}>{f}</Tag>)}
          </div>
        ) : null}
        <p className="mt-1 text-meta text-muted">{postedAgo(job.published_at)}</p>
      </div>
    </article>
  );
}
