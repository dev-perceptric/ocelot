"use client";

import { askConfirm } from "@/components/Dialog";
import { toast } from "@/components/Toast";
import { Button, Tag } from "@/components/ui";
import { answerAgency, removeAgency } from "./actions";

type Request = { id: string; agency_name: string; created_at: string };

// On the company's Team page: the agency that manages the company, and agencies asking to.
export function AgencyPanel({ company, agency, isOwner, canSee, requests }: {
  company: string; agency: { id: string; name: string } | null; isOwner: boolean; canSee: boolean; requests: Request[];
}) {
  if (!agency && !(canSee && requests.length)) return null;

  const answer = async (r: Request, yes: boolean) => {
    if (yes && !(await askConfirm({
      title: `Let ${r.agency_name} manage ${company}?`,
      body: `Its staff can post jobs for ${company} and see its applicants and hiring notes. They can't change your team or delete the company. You can remove the agency at any time.`,
      confirm: "Say yes",
    }))) return;
    const res = await answerAgency(r.id, yes);
    toast(res.ok ? (yes ? `${r.agency_name} now manages ${company}` : "Request declined") : res.message ?? "That didn't work. Try again.");
  };

  const remove = async () => {
    if (!agency || !(await askConfirm({
      title: `Remove ${agency.name}?`,
      body: `Its staff lose access to ${company}'s jobs and applicants right away. Jobs they posted stay with ${company}.`,
      confirm: "Remove agency", danger: true,
    }))) return;
    const res = await removeAgency();
    toast(res.ok ? `${agency.name} no longer manages ${company}` : res.message ?? "That didn't work. Try again.");
  };

  return (
    <section className="flex flex-col gap-4 border border-border bg-surface p-5 rounded-[var(--radius-card)]">
      <h2 className="text-card font-bold">Agency</h2>
      {agency ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-body"><strong>{agency.name}</strong> manages {company}&apos;s hiring. Its staff can post jobs and see applicants.</p>
          {isOwner ? <Button variant="ghost" onClick={remove}>Remove agency</Button> : null}
        </div>
      ) : null}
      {canSee ? requests.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4 first:border-t-0 first:pt-0">
          <p className="flex flex-wrap items-center gap-2 text-body">
            <Tag tone="warning">Waiting</Tag>
            <span><strong>{r.agency_name}</strong> asked to manage {company}&apos;s hiring.</span>
          </p>
          {isOwner ? (
            <span className="flex gap-2">
              <Button variant="ghost" onClick={() => answer(r, false)}>Decline</Button>
              <Button variant="secondary" onClick={() => answer(r, true)}>Say yes</Button>
            </span>
          ) : <span className="text-meta text-muted">The owner answers this.</span>}
        </div>
      )) : null}
    </section>
  );
}
