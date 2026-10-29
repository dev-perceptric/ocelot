"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Menu } from "@/components/Menu";
import { Select } from "@/components/Select";
import { toast } from "@/components/Toast";
import { Table, Tag, Td, Th } from "@/components/ui";
import { HIRING_LABEL, HIRING_TONE, SETTABLE, type HiringStage } from "@/lib/hiring";
import { moveApplicants } from "./actions";

export type Row = { id: string; name: string; headline: string | null; job: string; stage: HiringStage; applied: string };

export function JobFilter({ jobs, value }: { jobs: { id: string; title: string }[]; value: string | null }) {
  const router = useRouter();
  return (
    <Select aria-label="Job" value={value ?? ""} placeholder="All jobs"
      options={[{ value: "", label: "All jobs" }, ...jobs.map((j) => ({ value: j.id, label: j.title }))]}
      onChange={(v) => router.push(v ? `/employer/applicants?job=${v}` : "/employer/applicants")} />
  );
}

export function ApplicantTable({ rows, showJob }: { rows: Row[]; showJob: boolean }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const all = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const move = async (stage: HiringStage) => {
    setBusy(true);
    const r = await moveApplicants([...picked], stage);
    setBusy(false);
    if (!r.ok) return toast(r.message ?? "That didn't move. Try again.");
    toast(r.moved === 1 ? `Moved 1 applicant to ${HIRING_LABEL[stage]}` : `Moved ${r.moved} applicants to ${HIRING_LABEL[stage]}`);
    setPicked(new Set());
    router.refresh();
  };

  return (
    <>
      {picked.size ? (
        <div className="mb-3 flex items-center gap-3 border border-border bg-surface px-4 py-2 rounded-[var(--radius-card)]" role="region" aria-label="Selected applicants">
          <span className="text-body font-bold">{picked.size} selected</span>
          <div className={busy ? "pointer-events-none opacity-60" : ""}>
            <Menu label="Move selected" items={SETTABLE.map((s) => ({ label: `Move to ${HIRING_LABEL[s]}`, onSelect: () => move(s) }))} />
          </div>
          <button type="button" className="ml-auto text-meta underline" onClick={() => setPicked(new Set())}>Clear</button>
        </div>
      ) : null}
      <Table label="Applicants">
        <thead>
          <tr>
            <Th className="w-10">
              <input type="checkbox" aria-label="Select all" checked={all} onChange={() => setPicked(all ? new Set() : new Set(rows.map((r) => r.id)))} className="size-5 accent-ink" />
            </Th>
            <Th>Name</Th>{showJob ? <Th className="hidden md:table-cell">Job</Th> : null}<Th className="hidden sm:table-cell">Applied</Th><Th>Stage</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td><input type="checkbox" aria-label={`Select ${r.name}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} className="size-5 accent-ink" /></Td>
              <Td>
                <Link href={`/employer/applicants/${r.id}`} className="font-bold hover:underline">{r.name}</Link>
                {r.headline ? <p className="text-meta text-muted">{r.headline}</p> : null}
              </Td>
              {showJob ? <Td className="hidden text-meta md:table-cell">{r.job}</Td> : null}
              <Td className="hidden text-meta sm:table-cell">{r.applied}</Td>
              <Td><Tag tone={HIRING_TONE[r.stage]}>{HIRING_LABEL[r.stage]}</Tag></Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
