"use client";

import { useActionState } from "react";
import { keepValues } from "@/components/forms";
import { Button, Field, inputClass } from "@/components/ui";
import { createAgency, type CreateState } from "./actions";

export function CreateAgency() {
  const [state, action, pending] = useActionState<CreateState, FormData>(createAgency, {});
  return (
    <form onSubmit={keepValues(action)} className="flex max-w-[480px] flex-col gap-4">
      <Field label="Agency name" htmlFor="agency-name" error={state.error}>
        <input id="agency-name" name="name" required maxLength={120} className={inputClass} autoComplete="organization" />
      </Field>
      <Button type="submit" disabled={pending} aria-busy={pending}>{pending ? "Creating" : "Create agency"}</Button>
    </form>
  );
}
