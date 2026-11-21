"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { keepValues } from "@/components/forms";
import { Button, Field, inputClass } from "@/components/ui";
import {
  confirmSignup, logInWithPassword, resendSignupCode, sendPasswordReset, setNewPassword, signUpWithPassword,
  type PasswordState, type SignupState,
} from "./actions";

// A password box with a button that shows or hides what was typed.
export function PasswordInput({ id, autoComplete, invalid, describedBy }: { id: string; autoComplete: string; invalid?: boolean; describedBy?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input id={id} name="password" type={shown ? "text" : "password"} autoComplete={autoComplete} className={`${inputClass} pr-12`}
        aria-invalid={invalid} aria-describedby={describedBy} />
      <button type="button" onClick={() => setShown(!shown)} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown}
        className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center text-muted hover:text-ink rounded-[var(--radius-control)]">
        {shown ? <EyeOff size={20} strokeWidth={1.75} aria-hidden /> : <Eye size={20} strokeWidth={1.75} aria-hidden />}
      </button>
    </div>
  );
}

const q = (next: string) => (next && next !== "/app" ? `?next=${encodeURIComponent(next)}` : "");

export function PasswordLogin({ next }: { next: string }) {
  const [state, act, pending] = useActionState<PasswordState, FormData>(logInWithPassword, {});
  return (
    <form onSubmit={keepValues(act)} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" defaultValue={state.email} className={inputClass} />
      </Field>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="password" className="text-meta font-bold">Password</label>
          <Link href={`/forgot-password${q(next)}`} className="text-meta underline">Forgot password?</Link>
        </div>
        <PasswordInput id="password" autoComplete="current-password" invalid={Boolean(state.error)} describedBy={state.error ? "login-error" : undefined} />
      </div>
      {state.error ? <p id="login-error" className="text-meta text-danger" role="alert">{state.error}</p> : null}
      <Button type="submit" disabled={pending} aria-busy={pending} className="mt-2">{pending ? "Logging in" : "Log in"}</Button>
    </form>
  );
}

export function SignupForm({ next }: { next: string }) {
  const [state, act, pending] = useActionState<SignupState, FormData>(signUpWithPassword, { step: "form", next });
  const [checked, check, checking] = useActionState<SignupState, FormData>(confirmSignup, { step: "code" });
  const [resent, resend, resending] = useActionState<SignupState, FormData>(resendSignupCode, { step: "code" });

  if (state.step === "code") {
    return (
      <div className="flex flex-col gap-4">
        <form onSubmit={keepValues(check)} noValidate className="flex flex-col gap-4">
          <p className="text-body" role="status">
            We sent a code to <strong>{state.email}</strong>. Enter it to finish creating your account.
          </p>
          <input type="hidden" name="email" value={state.email} />
          <input type="hidden" name="next" value={state.next} />
          <Field label="Code" htmlFor="code" error={checked.error ?? resent.error}>
            <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={12} autoFocus
              className={`${inputClass} text-[20px] tracking-[0.3em]`} aria-invalid={Boolean(checked.error)} />
          </Field>
          <Button type="submit" disabled={checking} aria-busy={checking}>{checking ? "Checking" : "Create account"}</Button>
        </form>
        <form action={resend} className="text-meta">
          <input type="hidden" name="email" value={state.email} />
          <button type="submit" disabled={resending} className="underline disabled:text-muted">{resending ? "Sending" : "Send a new code"}</button>
        </form>
      </div>
    );
  }

  return (
    <form onSubmit={keepValues(act)} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="email" error={state.fields?.email}>
        <input id="email" name="email" type="email" autoComplete="email" defaultValue={state.email} className={inputClass} aria-invalid={Boolean(state.fields?.email)} />
      </Field>
      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-meta font-bold">Password</label>
        <PasswordInput id="password" autoComplete="new-password" invalid={Boolean(state.fields?.password)} describedBy="password-hint" />
        <p id="password-hint" className={`text-meta ${state.fields?.password ? "text-danger" : "text-muted"}`}>{state.fields?.password ?? "At least 8 characters."}</p>
      </div>
      {state.error ? <p className="text-meta text-danger" role="alert">{state.error}</p> : null}
      <Button type="submit" disabled={pending} aria-busy={pending} className="mt-2">{pending ? "Creating account" : "Create account"}</Button>
    </form>
  );
}

export function ForgotForm({ next }: { next: string }) {
  const [state, act, pending] = useActionState<PasswordState & { sent?: boolean }, FormData>(sendPasswordReset, {});
  if (state.sent) {
    return (
      <div className="mt-8 flex flex-col gap-4" role="status">
        <p className="text-body">If there&apos;s an account for <strong>{state.email}</strong>, we sent it a link to set a new password. The link works for 1 hour.</p>
        <Link href={`/login${q(next)}`} className="text-body font-bold underline">Back to log in</Link>
      </div>
    );
  }
  return (
    <form onSubmit={keepValues(act)} noValidate className="mt-8 flex flex-col gap-4">
      <Field label="Email" htmlFor="email" error={state.error}>
        <input id="email" name="email" type="email" autoComplete="email" defaultValue={state.email} className={inputClass} aria-invalid={Boolean(state.error)} />
      </Field>
      <Button type="submit" disabled={pending} aria-busy={pending}>{pending ? "Sending" : "Email me a link"}</Button>
    </form>
  );
}

export function ResetForm() {
  const [state, act, pending] = useActionState<PasswordState, FormData>(setNewPassword, {});
  return (
    <form onSubmit={keepValues(act)} noValidate className="mt-8 flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-meta font-bold">New password</label>
        <PasswordInput id="password" autoComplete="new-password" invalid={Boolean(state.error)} describedBy="password-hint" />
        <p id="password-hint" className={`text-meta ${state.error ? "text-danger" : "text-muted"}`}>{state.error ?? "At least 8 characters."}</p>
      </div>
      <Button type="submit" disabled={pending} aria-busy={pending}>{pending ? "Saving" : "Save password"}</Button>
    </form>
  );
}
