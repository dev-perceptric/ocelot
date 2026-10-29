"use client";

import { useActionState, useState, useTransition } from "react";
import { askConfirm, askText, Modal } from "@/components/Dialog";
import { keepValues } from "@/components/forms";
import { Menu } from "@/components/Menu";
import { Select } from "@/components/Select";
import { toast } from "@/components/Toast";
import { Button, Checkbox, Field, inputClass } from "@/components/ui";
import { COUNTRIES } from "@/lib/places";
import * as A from "../actions";

const SEA = ["VN", "SG", "TH", "MY", "ID", "PH"];

export function AddSource({ orgs }: { orgs: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [org, setOrg] = useState("");
  const [state, action, pending] = useActionState<A.SourceState, FormData>(async (prev, form) => {
    const next = await A.addSource(prev, form);
    if (next.done) { setOpen(false); toast(next.done); }
    return next;
  }, {});
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add job board</Button>
      <Modal open={open} onClose={() => !pending && setOpen(false)} title="Add a job board" footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button type="submit" form="add-source" disabled={pending} aria-busy={pending}>{pending ? "Importing" : "Add and import"}</Button>
        </>
      }>
        <form id="add-source" onSubmit={keepValues(action)} className="flex flex-col gap-4" noValidate>
          <Field label="Job board link" htmlFor="board-link">
            <input id="board-link" name="link" placeholder="boards.greenhouse.io/company" className={inputClass} autoFocus />
          </Field>
          <Field label="Company" htmlFor="board-org">
            <Select id="board-org" name="org_id" value={org} onChange={(v) => setOrg(v ?? "")}
              options={[{ value: "", label: "New company" }, ...orgs.map((o) => ({ value: o.id, label: o.name }))]} />
          </Field>
          {!org ? (
            <Field label="New company name" htmlFor="board-company">
              <input id="board-company" name="company" maxLength={120} className={inputClass} />
            </Field>
          ) : null}
          <Field label="Countries" htmlFor="board-countries">
            <Select id="board-countries" name="countries" multiple defaultValue={SEA} options={COUNTRIES.map((c) => ({ value: c.country_code, label: c.name }))} />
          </Field>
          <Checkbox id="board-niche" name="niche_only" defaultChecked label="Only marketing, sales and customer success roles" />
          {state.error ? <p className="text-meta text-danger" role="alert">{state.error}</p> : null}
        </form>
      </Modal>
    </>
  );
}

export function SourceActions({ id, name, active }: { id: string; name: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className={pending ? "pointer-events-none opacity-60" : ""} aria-busy={pending}>
      <Menu label={`Actions for ${name}`} items={[
        { label: "Sync now", onSelect: () => start(async () => { const r = await A.syncSourceNow(id); toast(r.ok ? `Synced: ${r.line}` : r.message ?? "The sync failed."); }) },
        { label: active ? "Pause" : "Resume", onSelect: () => start(async () => { const r = await A.setSourceActive(id, !active); toast(r.ok ? (active ? "Paused" : "Resumed") : r.message ?? "That didn't work."); }) },
        { label: "Delete", danger: true, onSelect: async () => {
          if (!(await askConfirm({ title: `Delete ${name}?`, body: "Its live jobs close. Their pages stay, marked as closed.", confirm: "Delete board", danger: true }))) return;
          start(async () => { const r = await A.deleteSource(id); toast(r.ok ? "Board deleted" : r.message ?? "That didn't work."); });
        } },
      ]} />
    </div>
  );
}

export function LookFor() {
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" disabled={pending} aria-busy={pending} onClick={async () => {
      const name = await askText({ title: "Look for a company's job board", label: "Company name", confirm: "Look for it" });
      if (name) start(async () => { const r = await A.lookForCompany(name); toast(r.ok ? "Added. It's checked in the next hourly run." : r.message ?? "That didn't work."); });
    }}>Look for a company</Button>
  );
}
