"use client";

import { Flag } from "lucide-react";
import { useActionState, useState } from "react";
import { Modal } from "@/components/Dialog";
import { keepValues } from "@/components/forms";
import { Button, Field, inputClass, textAreaClass } from "@/components/ui";
import { REPORT_REASONS } from "@/lib/email/templates";
import { submitReport, type ReportState } from "./report";

export function ReportButton({ slug, signedIn }: { slug: string; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ReportState, FormData>(submitReport, {});
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-2 inline-flex min-h-11 items-center gap-2 self-start text-meta underline">
        <Flag size={16} strokeWidth={1.75} aria-hidden />Report this job
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={state.done ? "Thanks for telling us" : "Report this job"} footer={
        state.done ? <Button onClick={() => setOpen(false)}>Done</Button> : (
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" form="report-form" disabled={pending} aria-busy={pending}>{pending ? "Sending" : "Send report"}</Button>
          </>
        )
      }>
        {state.done ? (
          <p role="status">We&apos;ll look at this job. Never pay a company to apply, interview or start a job.</p>
        ) : (
          <form id="report-form" onSubmit={keepValues(action)} className="flex flex-col gap-4" noValidate>
            <input type="hidden" name="slug" value={slug} />
            <fieldset>
              <legend className="mb-1 text-meta font-bold">What&apos;s wrong?</legend>
              {Object.entries(REPORT_REASONS).map(([value, label]) => (
                <label key={value} className="flex min-h-11 items-center gap-3">
                  <input type="radio" name="reason" value={value} required className="size-5 accent-ink" />{label}
                </label>
              ))}
            </fieldset>
            <Field label="Details (optional)" htmlFor="report-details">
              <textarea id="report-details" name="details" maxLength={2000} className={`${textAreaClass} min-h-24`} />
            </Field>
            {signedIn ? null : (
              <Field label="Your email, if we may follow up (optional)" htmlFor="report-email">
                <input id="report-email" name="contact_email" type="email" autoComplete="email" className={inputClass} />
              </Field>
            )}
            {state.error ? <p className="text-meta text-danger" role="alert">{state.error}</p> : null}
          </form>
        )}
      </Modal>
    </>
  );
}
