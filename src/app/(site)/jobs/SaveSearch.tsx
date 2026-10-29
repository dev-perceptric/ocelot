"use client";

import { Bell } from "lucide-react";
import { useActionState, useState } from "react";
import { Modal } from "@/components/Dialog";
import { keepValues } from "@/components/forms";
import { toast } from "@/components/Toast";
import { Button, ButtonLink, Field, RadioCards, inputClass } from "@/components/ui";
import { saveSearch, type SaveSearchState } from "@/app/app/settings/searches";

// "Save search" on Find jobs: a name and how often, then new matches arrive by email.
export function SaveSearch({ signedIn, search, defaultName }: { signedIn: boolean; search: string; defaultName: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<SaveSearchState, FormData>(async (prev, form) => {
    const next = await saveSearch(prev, form);
    if (next.savedAt) { setOpen(false); toast("Search saved. New matches will come by email."); }
    return next;
  }, {});
  if (!signedIn) {
    return <ButtonLink href={`/login?next=${encodeURIComponent(`/jobs${search}`)}`} variant="outline"><Bell size={18} strokeWidth={1.75} aria-hidden />Save search</ButtonLink>;
  }
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Bell size={18} strokeWidth={1.75} aria-hidden />Save search</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Save this search" footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" form="save-search" disabled={pending} aria-busy={pending}>{pending ? "Saving" : "Save search"}</Button>
        </>
      }>
        <form id="save-search" onSubmit={keepValues(action)} className="flex flex-col gap-4" noValidate>
          <input type="hidden" name="search" value={search} />
          <Field label="Name" htmlFor="search-name">
            <input id="search-name" name="name" defaultValue={defaultName} maxLength={80} className={inputClass} />
          </Field>
          <RadioCards name="frequency" legend="Email me new matches" defaultValue="weekly" options={[
            { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" },
          ]} />
          {state.error ? <p className="text-meta text-danger" role="alert">{state.error}</p> : null}
        </form>
      </Modal>
    </>
  );
}
