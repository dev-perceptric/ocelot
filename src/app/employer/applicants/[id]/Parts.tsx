"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { askConfirm } from "@/components/Dialog";
import { Select } from "@/components/Select";
import { toast } from "@/components/Toast";
import { Button, IconButton, textAreaClass } from "@/components/ui";
import { HIRING_LABEL, SETTABLE, type HiringStage } from "@/lib/hiring";
import { Trash2 } from "lucide-react";
import { addNote, deleteNote, moveApplicants } from "../actions";

export function StageSelect({ id, stage }: { id: string; stage: HiringStage }) {
  const router = useRouter();
  const [value, setValue] = useState<string>(stage);
  if (stage === "withdrawn") return <p className="text-body">The candidate withdrew.</p>;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="hiring-stage" className="text-meta font-bold">Stage</label>
      <Select id="hiring-stage" value={value} options={SETTABLE.map((s) => ({ value: s, label: HIRING_LABEL[s] }))} onChange={async (v) => {
        if (!v || v === value) return;
        const before = value;
        setValue(v);
        const r = await moveApplicants([id], v);
        if (!r.ok) { setValue(before); return toast(r.message ?? "That didn't move. Try again."); }
        toast(`Moved to ${HIRING_LABEL[v as HiringStage]}`);
        router.refresh();
      }} />
    </div>
  );
}

type Note = { id: string; author_id: string; author: string; body: string; when: string };

export function HiringNotes({ applicationId, me, notes }: { applicationId: string; me: string; notes: Note[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    const r = await addNote(applicationId, text);
    setBusy(false);
    if (!r.ok) return toast(r.message ?? "The note didn't save. Try again.");
    setText("");
    toast("Note added");
    router.refresh();
  };
  const remove = async (n: Note) => {
    if (!(await askConfirm({ title: "Delete this note?", confirm: "Delete note", danger: true }))) return;
    const r = await deleteNote(applicationId, n.id);
    toast(r.ok ? "Note deleted" : r.message ?? "That didn't delete. Try again.");
    if (r.ok) router.refresh();
  };
  return (
    <div className="mt-3 flex flex-col gap-4">
      {notes.length ? (
        <ul className="flex flex-col gap-3">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start gap-3 border border-border bg-surface p-4 rounded-[var(--radius-card)]">
              <div className="min-w-0 flex-1">
                <p className="text-meta text-muted">{n.author}, {n.when}</p>
                <p className="mt-1 whitespace-pre-line break-words text-body">{n.body}</p>
              </div>
              {n.author_id === me ? <IconButton label="Delete note" onClick={() => remove(n)}><Trash2 size={18} strokeWidth={1.75} aria-hidden /></IconButton> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <label htmlFor="new-note" className="sr-only">New note</label>
      <textarea id="new-note" rows={3} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Only your team sees notes" className={textAreaClass} />
      <div><Button variant="outline" disabled={busy || !text.trim()} aria-busy={busy} onClick={add}>Add note</Button></div>
    </div>
  );
}
