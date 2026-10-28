"use client";

import { keepValues } from "@/components/forms";
import { useActionState } from "react";
import { Button, RadioCards } from "@/components/ui";
import { chooseIntent, type WelcomeState } from "./actions";

export function WelcomeForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<WelcomeState, FormData>(chooseIntent, {});
  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-6">
      <input type="hidden" name="next" value={next} />
      <RadioCards
        name="intent"
        legend="What brings you to Ocelot?"
        required
        options={[
          { value: "candidate", label: "Find a job", line: "Search roles and track every application." },
          { value: "employer", label: "Hire for my company", line: "Post roles and manage applicants." },
        ]}
      />
      {state.error ? <p className="text-meta text-danger" role="alert">{state.error}</p> : null}
      <Button type="submit" disabled={pending} aria-busy={pending} className="self-start">{pending ? "Saving" : "Continue"}</Button>
      <p className="text-meta text-muted">You can use both sides of Ocelot with one account.</p>
    </form>
  );
}
