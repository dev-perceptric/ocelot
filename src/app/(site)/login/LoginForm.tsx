"use client";

import { keepValues } from "@/components/forms";
import { useActionState } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { sendLink, verifyCode, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [sent, send, sending] = useActionState<LoginState, FormData>(sendLink, { step: "email", next });
  const [checked, check, checking] = useActionState<LoginState, FormData>(verifyCode, { step: "code" });

  if (sent.step === "code") {
    return (
      <div className="flex flex-col gap-4">
      <form onSubmit={keepValues(check)} className="flex flex-col gap-4">
        <p className="text-body" role="status">
          We sent an email to <strong>{sent.email}</strong>. Open the link in it, or enter the code here.
        </p>
        <input type="hidden" name="email" value={sent.email} />
        <input type="hidden" name="next" value={sent.next} />
        <Field label="Code" htmlFor="code" error={checked.error}>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={12}
            required
            autoFocus
            className={`${inputClass} text-[20px] tracking-[0.3em]`}
            aria-invalid={Boolean(checked.error)}
            aria-describedby={checked.error ? "code-error" : undefined}
          />
        </Field>
        <Button type="submit" disabled={checking} aria-busy={checking}>{checking ? "Checking" : "Log in"}</Button>
      </form>
      <form action={send} className="flex flex-wrap items-center gap-4 text-meta">
        <input type="hidden" name="email" value={sent.email} />
        <input type="hidden" name="next" value={sent.next} />
        <button type="submit" disabled={sending} className="underline disabled:text-muted">{sending ? "Sending" : "Send a new email"}</button>
        <a href={`/login?next=${encodeURIComponent(sent.next ?? "/app")}`} className="underline">Use a different email</a>
      </form>
      </div>
    );
  }

  return (
    <form onSubmit={keepValues(send)} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="email" error={sent.error}>
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClass}
          aria-invalid={Boolean(sent.error)} aria-describedby={sent.error ? "email-error" : undefined} />
      </Field>
      <Button type="submit" disabled={sending} aria-busy={sending}>{sending ? "Sending" : "Email me a code"}</Button>
    </form>
  );
}
