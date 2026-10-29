"use client";

import { Plus, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { askConfirm } from "@/components/Dialog";
import { keepValues } from "@/components/forms";
import { Select } from "@/components/Select";
import { toast } from "@/components/Toast";
import { Button, Field, IconButton, inputClass, textAreaClass } from "@/components/ui";
import { STAGE_LABEL, STAGES, type Contact, type Stage } from "@/lib/tracker";
import { deleteCard, saveContacts, saveNotes, setStage, updateCard, withdrawApplication, type CardState } from "../actions";

export function StagePicker({ id, stage }: { id: string; stage: Stage }) {
  const [value, setValue] = useState(stage);
  return (
    <div className="w-56">
      <Select aria-label="Stage" value={value} options={STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] }))}
        onChange={async (v) => {
          if (!v || v === value) return;
          const before = value;
          setValue(v as Stage);
          const r = await setStage(id, v as Stage);
          if (r.ok) toast(`Moved to ${STAGE_LABEL[v as Stage]}`);
          else { setValue(before); toast(r.message ?? "That didn't move. Try again."); }
        }} />
    </div>
  );
}

// Saves a second after typing stops, and when leaving the box.
export function Notes({ id, initial }: { id: string; initial: string }) {
  const [text, setText] = useState(initial);
  const [status, setStatus] = useState<"saved" | "saving" | "unsaved" | "failed">("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef(initial);
  const save = async (value: string) => {
    if (value === last.current) return;
    setStatus("saving");
    const r = await saveNotes(id, value);
    if (r.ok) { last.current = value; setStatus("saved"); } else setStatus("failed");
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="notes" className="text-meta font-bold">Notes</label>
      <textarea id="notes" value={text} maxLength={20000} className={`${textAreaClass} min-h-48`}
        onChange={(e) => {
          setText(e.target.value);
          setStatus("unsaved");
          if (timer.current) clearTimeout(timer.current);
          const v = e.target.value;
          timer.current = setTimeout(() => void save(v), 1000);
        }}
        onBlur={() => void save(text)} />
      <p className="text-meta text-muted" aria-live="polite">
        {status === "saving" ? "Saving" : status === "failed" ? <span className="text-danger">Not saved. Check your connection.</span> : status === "unsaved" ? "Typing" : "Saved"}.
        {" "}Only you can see these notes. The employer cannot access your job search tracker.
      </p>
    </div>
  );
}

export function Details({ id, values }: { id: string; values: { title: string; company: string; url: string; location: string; salary: string } }) {
  const [state, action, pending] = useActionState<CardState, FormData>(updateCard, {});
  const e = state.errors ?? {};
  useEffect(() => { if (state.savedAt) toast("Saved"); }, [state.savedAt]);
  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={id} />
      <Field label="Job title" htmlFor="d-title" error={e.title}><input id="d-title" name="title" defaultValue={values.title} maxLength={200} className={inputClass} /></Field>
      <Field label="Company" htmlFor="d-company" error={e.company}><input id="d-company" name="company" defaultValue={values.company} maxLength={200} className={inputClass} /></Field>
      <Field label="Link to the job" htmlFor="d-url" error={e.url}><input id="d-url" name="url" defaultValue={values.url} className={inputClass} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Location" htmlFor="d-location" error={e.location}><input id="d-location" name="location" defaultValue={values.location} maxLength={200} className={inputClass} /></Field>
        <Field label="Pay" htmlFor="d-salary" error={e.salary}><input id="d-salary" name="salary" defaultValue={values.salary} maxLength={100} className={inputClass} /></Field>
      </div>
      {state.error ? <p className="text-meta text-danger" role="alert">{state.error}</p> : null}
      <Button type="submit" variant="outline" disabled={pending} aria-busy={pending} className="self-start">{pending ? "Saving" : "Save details"}</Button>
    </form>
  );
}

const EMPTY: Contact = { name: "", role: "", email: "", phone: "" };

export function Contacts({ id, initial }: { id: string; initial: Contact[] }) {
  const [list, setList] = useState<Contact[]>(initial);
  const [dirty, setDirty] = useState(false);
  const set = (i: number, k: keyof Contact, v: string) => { setList(list.map((c, j) => (j === i ? { ...c, [k]: v } : c))); setDirty(true); };
  return (
    <div className="flex flex-col gap-3">
      {list.map((c, i) => (
        <div key={i} className="grid gap-2 border border-border p-3 rounded-[var(--radius-card)] sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          {(["name", "role", "email", "phone"] as const).map((k) => (
            <div key={k}>
              <label htmlFor={`c-${i}-${k}`} className="sr-only">{k[0].toUpperCase() + k.slice(1)} of contact {i + 1}</label>
              <input id={`c-${i}-${k}`} value={c[k]} placeholder={{ name: "Name", role: "Role", email: "Email", phone: "Phone" }[k]}
                onChange={(e) => set(i, k, e.target.value)} className={`${inputClass} h-11`} />
            </div>
          ))}
          <IconButton label={`Remove contact ${i + 1}`} onClick={() => { setList(list.filter((_, j) => j !== i)); setDirty(true); }}><X size={20} aria-hidden /></IconButton>
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        {list.length < 20 ? <Button variant="outline" onClick={() => setList([...list, EMPTY])}><Plus size={18} aria-hidden />Add a contact</Button> : null}
        {dirty ? <Button onClick={async () => { const r = await saveContacts(id, list); toast(r.ok ? "Contacts saved" : "That didn't save. Try again."); if (r.ok) setDirty(false); }}>Save contacts</Button> : null}
      </div>
    </div>
  );
}

export function CardDanger({ id, stage }: { id: string; stage: Stage }) {
  return (
    <div className="flex flex-wrap gap-3">
      {stage !== "archived" ? (
        <Button variant="outline" onClick={async () => { const r = await setStage(id, "archived"); toast(r.ok ? "Archived" : "That didn't work."); }}>Archive</Button>
      ) : null}
      <Button variant="ghost" className="text-danger" onClick={async () => {
        if (await askConfirm({ title: "Delete this job from your tracker?", body: "Its notes, contacts and history are deleted too. Applications you sent stay with the company.", confirm: "Delete", danger: true })) {
          const r = await deleteCard(id);
          if (r && !r.ok) toast(r.message ?? "That didn't delete.");
        }
      }}>Delete</Button>
    </div>
  );
}

export function Withdraw({ cardId, applicationId, company }: { cardId: string; applicationId: string; company: string }) {
  return (
    <Button variant="outline" onClick={async () => {
      if (!(await askConfirm({ title: "Withdraw your application?", body: `${company} will see that you withdrew. You can't undo this.`, confirm: "Withdraw application", danger: true }))) return;
      const r = await withdrawApplication(cardId, applicationId);
      toast(r.ok ? "Application withdrawn" : r.message ?? "That didn't work. Try again.");
    }}>Withdraw application</Button>
  );
}
