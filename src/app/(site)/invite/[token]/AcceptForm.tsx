"use client";

import { useActionState } from "react";
import { keepValues } from "@/components/forms";
import { Button } from "@/components/ui";
import { accept, type AcceptState } from "./actions";

export function AcceptForm({ token, company }: { token: string; company: string }) {
  const [state, action, pending] = useActionState<AcceptState, FormData>(accept, {});
  return (
    <form onSubmit={keepValues(action)} className="flex flex-col items-start gap-4">
      <input type="hidden" name="token" value={token} />
      {state.error ? <p className="text-meta text-danger" role="alert">{state.error}</p> : null}
      <Button type="submit" disabled={pending} aria-busy={pending}>{pending ? "Joining" : `Join ${company}`}</Button>
    </form>
  );
}
