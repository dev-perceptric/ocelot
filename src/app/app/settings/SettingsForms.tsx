"use client";

import { keepValues } from "@/components/forms";
import { useActionState, useState } from "react";
import { Switch } from "@/components/Switch";
import { toast } from "@/components/Toast";
import { Button, Field, inputClass } from "@/components/ui";
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
  job_alerts: "Alerts for searches I save",
  weekly_digest: "Weekly jobs digest",
  product_news: "News about Ocelot",
};

export function NotificationSwitches({ values }: { values: Record<Pref, boolean> }) {
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
      {(Object.keys(LABELS) as Pref[]).map((k) => (
        <Switch key={k} id={`pref-${k}`} label={LABELS[k]} checked={on[k]} onChange={(v) => flip(k, v)} />
      ))}
    </div>
  );
}
