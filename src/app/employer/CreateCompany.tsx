"use client";

import { useActionState } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { createCompany, type OrgState } from "./actions";

export function CreateCompany() {
  const [state, action, pending] = useActionState<OrgState, FormData>(createCompany, {});
  return (
    <form action={action} className="flex max-w-[480px] flex-col gap-4">
      <Field label="Company name" htmlFor="name" error={state.error}>
        <input id="name" name="name" required maxLength={120} className={inputClass} autoComplete="organization" />
      </Field>
      <Button type="submit" disabled={pending} aria-busy={pending}>{pending ? "Creating" : "Create company"}</Button>
    </form>
  );
}
