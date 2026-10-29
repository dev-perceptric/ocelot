"use client";

import { useActionState, useState } from "react";
import { Modal } from "@/components/Dialog";
import { keepValues } from "@/components/forms";
import { Select } from "@/components/Select";
import { Button, Field, inputClass, textAreaClass } from "@/components/ui";
import { OPEN_STAGES, STAGE_LABEL } from "@/lib/tracker";
import { createCard, type CardState } from "./actions";

export function AddJob({ label = "Add a job" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<CardState, FormData>(createCard, {});
  const e = state.errors ?? {};
  const err = (k: keyof typeof e) => (e[k] ? { "aria-invalid": true, "aria-describedby": `card-${k}-error` } : {});
  return (
    <>
      <Button onClick={() => setOpen(true)}>{label}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add a job" footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" form="add-job" disabled={pending} aria-busy={pending}>{pending ? "Adding" : "Add job"}</Button>
        </>
      }>
        <form id="add-job" onSubmit={keepValues(action)} className="flex flex-col gap-4" noValidate>
          <Field label="Job title" htmlFor="card-title" error={e.title}>
            <input id="card-title" name="title" required maxLength={200} autoFocus className={inputClass} {...err("title")} />
          </Field>
          <Field label="Company" htmlFor="card-company" error={e.company}>
            <input id="card-company" name="company" maxLength={200} className={inputClass} />
          </Field>
          <Field label="Link to the job" htmlFor="card-url" error={e.url}>
            <input id="card-url" name="url" placeholder="company.com/jobs/123" className={inputClass} {...err("url")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Location" htmlFor="card-location"><input id="card-location" name="location" maxLength={200} placeholder="Remote, Hanoi" className={inputClass} /></Field>
            <Field label="Pay" htmlFor="card-salary"><input id="card-salary" name="salary" maxLength={100} placeholder="USD 2,000 / month" className={inputClass} /></Field>
          </div>
          <Field label="Stage" htmlFor="card-stage">
            <Select id="card-stage" name="stage" defaultValue="saved" options={OPEN_STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] }))} />
          </Field>
          <Field label="Notes" htmlFor="card-notes">
            <textarea id="card-notes" name="notes" maxLength={20000} className={`${textAreaClass} min-h-24`} />
          </Field>
          {state.error ? <p className="text-meta text-danger" role="alert">{state.error}</p> : null}
        </form>
      </Modal>
    </>
  );
}
