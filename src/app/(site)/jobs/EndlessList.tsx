"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CardState } from "@/components/JobCard";
import { Button } from "@/components/ui";
import type { JobWithOrg } from "@/lib/queries";
import { moreJobs } from "./actions";
import { JobList } from "./JobList";

// The home page's job list: every live job, loading the next 50 as the visitor nears the end. The first page comes
// from the server, so people without JavaScript and search engines see it, with a link to page 2.
export function EndlessList({ first, states: firstStates, total, signedIn, panelTop }: {
  first: JobWithOrg[]; states: Record<string, CardState>; total: number; signedIn: boolean; panelTop?: string;
}) {
  const [jobs, setJobs] = useState(first);
  const [states, setStates] = useState(firstStates);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"idle" | "loading" | "failed" | "done">(first.length >= total ? "done" : "idle");
  const busy = useRef(false);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setStatus("loading");
    try {
      const next = await moreJobs(page + 1);
      // The order can shift a little between pages (a job closes, a new one goes up), so never show a job twice.
      const seen = new Set(jobs.map((j) => j.id));
      const all = [...jobs, ...next.jobs.filter((j) => !seen.has(j.id))];
      setJobs(all);
      setStates((now) => ({ ...now, ...next.states }));
      setPage(page + 1);
      setStatus(!next.jobs.length || all.length >= total ? "done" : "idle");
    } catch {
      setStatus("failed");
    } finally {
      busy.current = false;
    }
  }, [jobs, page, total]);

  useEffect(() => {
    const el = end.current;
    if (!el || status !== "idle") return;
    // Start loading well before the end, so scrolling rarely has to wait.
    const seen = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) load(); }, { rootMargin: "1200px 0px" });
    seen.observe(el);
    return () => seen.disconnect();
  }, [status, load]);

  return (
    <JobList jobs={jobs} states={states} signedIn={signedIn} panelTop={panelTop} autoOpen={false} end={
      <div ref={end} className="py-6 text-center">
        <p role="status" className="text-meta text-muted">
          {status === "loading" ? "Loading more jobs" : status === "done" ? `That's all ${total.toLocaleString("en-US")} jobs.` : status === "failed" ? "More jobs didn't load." : ""}
        </p>
        {status === "failed" ? <Button variant="outline" className="mt-3" onClick={load}>Try again</Button> : null}
        <noscript><Link href="/jobs?page=2" className="text-body font-bold underline">More jobs</Link></noscript>
      </div>
    } />
  );
}
