"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Modal } from "@/components/Dialog";
import { toast } from "@/components/Toast";
import { Button, ButtonLink } from "@/components/ui";
import { STAGE_LABEL, type Stage } from "@/lib/tracker";
import { markApplied, saveJob } from "@/app/app/tracker/actions";

type Props = { jobId: string; slug: string; title: string; company: string; applyUrl: string | null; signedIn: boolean; card: { id: string; stage: Stage } | null };

// Apply opens the company's page in a new tab; when the person comes back, we ask whether they applied.
// Clicking the link alone never marks a job as Applied.
export function ApplyButton({ jobId, slug, title, company, applyUrl, signedIn, card }: Props) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  if (!applyUrl) return null;
  const alreadyApplied = card && card.stage !== "saved";
  return (
    <>
      <ButtonLink href={applyUrl} target="_blank" rel="noopener nofollow"
        onClick={() => { if (signedIn && !alreadyApplied) setTimeout(() => setAsking(true), 400); }}>
        Apply on company site
      </ButtonLink>
      {signedIn ? (
        <Modal open={asking} onClose={() => setAsking(false)} title={`Did you apply to ${title}?`} size="sm" footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(false)}>Not yet</Button>
            <Button disabled={pending} aria-busy={pending} onClick={() => start(async () => {
              const r = await markApplied(jobId);
              setAsking(false);
              toast(r.ok ? "Moved to Applied in My search" : r.message ?? "That didn't save.");
            })}>Yes, I applied</Button>
          </>
        }>
          <p>We&apos;ll move {title} at {company} to Applied in your tracker.</p>
        </Modal>
      ) : (
        <p className="text-meta text-muted"><Link href={`/login?next=/jobs/${slug}`} className="underline">Log in</Link> to track this job.</p>
      )}
    </>
  );
}

export function SaveButton({ jobId, slug, signedIn, card }: Props) {
  const [saved, setSaved] = useState(card);
  const [pending, start] = useTransition();
  if (!signedIn) {
    return <ButtonLink href={`/login?next=/jobs/${slug}`} variant="outline"><Bookmark size={18} strokeWidth={1.75} aria-hidden />Save job</ButtonLink>;
  }
  if (saved) {
    return (
      <ButtonLink href={`/app/tracker/${saved.id}`} variant="outline">
        <BookmarkCheck size={18} strokeWidth={1.75} aria-hidden />{saved.stage === "saved" ? "Saved" : STAGE_LABEL[saved.stage]} in My search
      </ButtonLink>
    );
  }
  return (
    <Button variant="outline" disabled={pending} aria-busy={pending} onClick={() => start(async () => {
      const r = await saveJob(jobId);
      if (r.ok && r.id) { setSaved({ id: r.id, stage: "saved" }); toast("Saved to My search"); }
      else toast(r.message ?? "That didn't save.");
    })}>
      <Bookmark size={18} strokeWidth={1.75} aria-hidden />Save job
    </Button>
  );
}

// Applying on Ocelot: the form, or once sent, the date and a link to the card.
export function OcelotApply({ slug, signedIn, applied }: { slug: string; signedIn: boolean; applied: { day: string; cardId: string | null } | null }) {
  if (applied) {
    return <ButtonLink href={applied.cardId ? `/app/tracker/${applied.cardId}` : "/app/tracker"} variant="outline">Applied {applied.day}</ButtonLink>;
  }
  return <ButtonLink href={signedIn ? `/jobs/${slug}/apply` : `/login?next=/jobs/${slug}/apply`}>Apply</ButtonLink>;
}
