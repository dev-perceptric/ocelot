"use client";

import { useActionState } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { sendLink, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendLink, {});
  if (state.sent) {
    return (
      <p className="text-body" role="status">
        We sent a login link to <strong>{state.sent}</strong>. Open it on this device.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="email" error={state.error}>
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClass}
          aria-invalid={Boolean(state.error)} aria-describedby={state.error ? "email-error" : undefined} />
      </Field>
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Sending" : "Email me a login link"}
      </Button>
    </form>
  );
}
