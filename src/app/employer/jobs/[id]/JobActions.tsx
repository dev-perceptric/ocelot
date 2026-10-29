"use client";

import { useTransition } from "react";
import { askConfirm } from "@/components/Dialog";
import { toast } from "@/components/Toast";
import { Button, ButtonLink } from "@/components/ui";
import { deleteJob, duplicateJob, setJobStatus } from "../actions";

export function JobActions({ id, status, everPublished, slug }: { id: string; status: string; everPublished: boolean; slug: string }) {
  const [pending, start] = useTransition();
  const run = (f: () => Promise<{ ok: boolean; message?: string }>, done: string) =>
    start(async () => { const r = await f(); toast(r.ok ? done : r.message ?? "That didn't work. Try again."); });

  return (
    <div className="flex flex-wrap gap-3">
      <ButtonLink href={`/employer/jobs/${id}/preview`} variant="outline">Preview</ButtonLink>
      {status === "published" ? <ButtonLink href={`/jobs/${slug}`} variant="outline" target="_blank">View live page</ButtonLink> : null}
      {status === "pending_review" ? (
        <Button variant="outline" disabled={pending} onClick={() => run(() => setJobStatus(id, "draft"), "Moved back to drafts")}>Withdraw from review</Button>
      ) : null}
      {status === "published" ? (
        <Button variant="outline" disabled={pending} onClick={async () => {
          if (await askConfirm({ title: "Close this job?", body: "It stops showing in search. Its page stays, marked as closed.", confirm: "Close job", danger: true })) {
            run(() => setJobStatus(id, "closed"), "Job closed");
          }
        }}>Close job</Button>
      ) : null}
      <Button variant="outline" disabled={pending} onClick={() => run(() => duplicateJob(id), "Copy made")}>Duplicate</Button>
      {!everPublished && (status === "draft" || status === "rejected") ? (
        <Button variant="ghost" disabled={pending} className="text-danger" onClick={async () => {
          if (await askConfirm({ title: "Delete this draft?", confirm: "Delete draft", danger: true })) run(() => deleteJob(id), "Draft deleted");
        }}>Delete draft</Button>
      ) : null}
    </div>
  );
}
