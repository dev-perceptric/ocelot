"use client";

import { keepValues } from "@/components/forms";
import { useActionState, useState } from "react";
import { Modal } from "@/components/Dialog";
import { Switch } from "@/components/Switch";
import { toast } from "@/components/Toast";
import { Button, Field, inputClass } from "@/components/ui";
import { deleteAccount, type DeleteState } from "./account";
import { changeEmail, setPref, type EmailState, type Pref } from "./actions";

export function EmailForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState<EmailState, FormData>(changeEmail, {});
  if (state.sentTo) {
    return (
      <p className="text-body" role="status">
        We sent a confirmation link to <strong>{state.sentTo}</strong> and to <strong>{current}</strong>. Your email changes after you open both.
      </p>
    );
  }
  return (
    <form onSubmit={keepValues(action)} className="flex max-w-[480px] flex-col gap-4">
      <Field label="New email" htmlFor="new-email" error={state.error}>
        <input id="new-email" name="email" type="email" required autoComplete="email" className={inputClass} placeholder={current}
          aria-invalid={Boolean(state.error)} aria-describedby={state.error ? "new-email-error" : undefined} />
      </Field>
      <Button type="submit" variant="outline" disabled={pending} aria-busy={pending} className="self-start">
        {pending ? "Sending" : "Change email"}
      </Button>
    </form>
  );
}

const LABELS: Record<Pref, string> = {
  application_updates: "Updates on applications I send",
  new_applicants: "New applicants to my company's jobs",
  job_alerts: "Alerts for searches I save",
  weekly_digest: "Weekly jobs digest",
  product_news: "News about Ocelot",
};

// Shows a switch for each choice passed in (New applicants only for people on a company team).
export function NotificationSwitches({ values }: { values: Partial<Record<Pref, boolean>> }) {
  const [on, setOn] = useState(values);
  const flip = async (key: Pref, next: boolean) => {
    setOn((v) => ({ ...v, [key]: next }));
    const { ok } = await setPref(key, next);
    if (ok) toast("Saved");
    else {
      setOn((v) => ({ ...v, [key]: !next }));
      toast("That didn't save. Try again.");
    }
  };
  return (
    <div className="flex max-w-[560px] flex-col divide-y divide-border">
      {(Object.keys(LABELS) as Pref[]).filter((k) => k in on).map((k) => (
        <Switch key={k} id={`pref-${k}`} label={LABELS[k]} checked={Boolean(on[k])} onChange={(v) => flip(k, v)} />
      ))}
    </div>
  );
}

export function DeleteAccount({ email, companies }: { email: string; companies: string[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteAccount, {});
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>Delete account</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Delete your account?" footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" form="delete-account" variant="danger" disabled={pending} aria-busy={pending}>{pending ? "Deleting" : "Delete account"}</Button>
        </>
      }>
        <form id="delete-account" onSubmit={keepValues(action)} className="flex flex-col gap-4" noValidate>
          <p>This removes your profile, tracker, notes, tasks, résumés and settings. It can&apos;t be undone.</p>
          <p>Companies keep applications you already sent, without your name, contact details or résumé.</p>
          {companies.length ? <p>Companies where you&apos;re the only member are deleted too: {companies.join(", ")}.</p> : null}
          <Field label={`Type ${email} to confirm`} htmlFor="delete-confirm" error={state.error}>
            <input id="delete-confirm" name="confirm" autoComplete="off" className={inputClass}
              aria-invalid={Boolean(state.error)} aria-describedby={state.error ? "delete-confirm-error" : undefined} />
          </Field>
        </form>
      </Modal>
    </>
  );
}
