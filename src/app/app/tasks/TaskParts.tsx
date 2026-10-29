"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { askConfirm, Modal } from "@/components/Dialog";
import { keepValues } from "@/components/forms";
import { Menu } from "@/components/Menu";
import { Select } from "@/components/Select";
import { toast } from "@/components/Toast";
import { Button, Field, inputClass, Tag, textAreaClass } from "@/components/ui";
import { bucket, clock, dayKey, relativeDay, timeKey } from "@/lib/when";
import { deleteInterview, deleteTask, saveInterview, saveTask, toggleTask, type TaskState } from "./actions";

export type Task = { id: string; title: string; due_at: string | null; done_at: string | null; item_id: string | null; item_title?: string | null };
export type Interview = { id: string; item_id: string; starts_at: string; title: string | null; meeting_url: string | null; notes: string; item_title?: string | null };

// ---------- Tasks ----------

function TaskDialog({ open, onClose, task, itemId, cards, tz }: {
  open: boolean; onClose: () => void; task?: Task; itemId?: string; cards?: { id: string; title: string }[]; tz: string;
}) {
  // Close and toast from the action: a saved task can move to another group, which unmounts this dialog.
  const [state, action, pending] = useActionState<TaskState, FormData>(async (prev, form) => {
    const next = await saveTask(prev, form);
    if (next.doneAt) { onClose(); toast(task ? "Task saved" : "Task added"); }
    return next;
  }, {});
  return (
    <Modal open={open} onClose={onClose} title={task ? "Edit task" : "Add a task"} footer={
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" form={`task-form-${task?.id ?? "new"}`} disabled={pending} aria-busy={pending}>{pending ? "Saving" : task ? "Save task" : "Add task"}</Button>
      </>
    }>
      <form id={`task-form-${task?.id ?? "new"}`} onSubmit={keepValues(action)} className="flex flex-col gap-4" noValidate>
        {task ? <input type="hidden" name="id" value={task.id} /> : null}
        <Field label="Task" htmlFor={`t-title-${task?.id ?? "new"}`}>
          <input id={`t-title-${task?.id ?? "new"}`} name="title" defaultValue={task?.title} maxLength={200} autoFocus placeholder="Follow up with the recruiter" className={inputClass} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due date" htmlFor={`t-date-${task?.id ?? "new"}`}>
            <input id={`t-date-${task?.id ?? "new"}`} name="due_date" type="date" defaultValue={task?.due_at ? dayKey(task.due_at, tz) : ""} className={inputClass} />
          </Field>
          <Field label="Time (optional)" htmlFor={`t-time-${task?.id ?? "new"}`}>
            <input id={`t-time-${task?.id ?? "new"}`} name="due_time" type="time" defaultValue={task?.due_at ? timeKey(task.due_at, tz) : ""} className={inputClass} />
          </Field>
        </div>
        {itemId ? <input type="hidden" name="item_id" value={itemId} /> : cards?.length ? (
          <Field label="Job (optional)" htmlFor={`t-item-${task?.id ?? "new"}`}>
            <Select id={`t-item-${task?.id ?? "new"}`} name="item_id" defaultValue={task?.item_id ?? ""} options={[{ value: "", label: "No job" }, ...cards.map((c) => ({ value: c.id, label: c.title }))]} />
          </Field>
        ) : null}
        {state.error ? <p className="text-meta text-danger" role="alert">{state.error}</p> : null}
      </form>
    </Modal>
  );
}

export function AddTask({ itemId, cards, tz, label = "Add a task" }: { itemId?: string; cards?: { id: string; title: string }[]; tz: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  return (
    <>
      <Button variant={itemId ? "outline" : "primary"} onClick={() => { setRound(round + 1); setOpen(true); }}>{label}</Button>
      <TaskDialog key={round} open={open} onClose={() => setOpen(false)} itemId={itemId} cards={cards} tz={tz} />
    </>
  );
}

const DUE_TONE = { overdue: "danger", today: "warning", upcoming: "neutral", someday: "neutral" } as const;

function TaskRow({ t, tz, cards, showJob }: { t: Task; tz: string; cards?: { id: string; title: string }[]; showJob: boolean }) {
  const [done, setDone] = useState(Boolean(t.done_at));
  const [editing, setEditing] = useState(false);
  const b = bucket(t.due_at, tz);
  return (
    <li className="flex items-start gap-3 py-3">
      <input type="checkbox" id={`task-${t.id}`} checked={done} className="mt-1 size-5 shrink-0 accent-ink"
        aria-label={`${done ? "Mark not done" : "Mark done"}: ${t.title}`}
        onChange={async () => {
          setDone(!done);
          const r = await toggleTask(t.id, !done);
          if (!r.ok) { setDone(done); toast("That didn't save. Try again."); }
        }} />
      <div className="min-w-0 flex-1">
        <label htmlFor={`task-${t.id}`} className={`break-words text-body ${done ? "text-muted line-through" : ""}`}>{t.title}</label>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-meta text-muted">
          {t.due_at && !done ? <Tag tone={DUE_TONE[b]}>{b === "overdue" ? `Overdue, ${relativeDay(t.due_at, tz)}` : `Due ${relativeDay(t.due_at, tz)}${timeKey(t.due_at, tz) !== "09:00" ? ` ${clock(t.due_at, tz)}` : ""}`}</Tag> : null}
          {showJob && t.item_id && t.item_title ? <Link href={`/app/tracker/${t.item_id}`} className="underline">{t.item_title}</Link> : null}
        </div>
      </div>
      <Menu label={`Actions for ${t.title}`} items={[
        { label: "Edit", onSelect: () => setEditing(true) },
        { label: "Delete", danger: true, onSelect: async () => {
          if (await askConfirm({ title: "Delete this task?", confirm: "Delete task", danger: true })) {
            const r = await deleteTask(t.id); toast(r.ok ? "Task deleted" : "That didn't delete.");
          }
        } },
      ]} />
      {editing ? <TaskDialog open onClose={() => setEditing(false)} task={t} cards={cards} itemId={showJob ? undefined : t.item_id ?? undefined} tz={tz} /> : null}
    </li>
  );
}

export function TaskList({ tasks, tz, cards, showJob = true, groups = true }: { tasks: Task[]; tz: string; cards?: { id: string; title: string }[]; showJob?: boolean; groups?: boolean }) {
  const open = tasks.filter((t) => !t.done_at).sort((a, b) => (a.due_at ?? "9").localeCompare(b.due_at ?? "9"));
  const done = tasks.filter((t) => t.done_at).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
  const section = (title: string, list: Task[]) => list.length ? (
    <section key={title} className="mt-6 first:mt-0">
      <h3 className="text-meta font-bold text-muted">{title}</h3>
      <ul className="divide-y divide-border">{list.map((t) => <TaskRow key={t.id} t={t} tz={tz} cards={cards} showJob={showJob} />)}</ul>
    </section>
  ) : null;
  if (!tasks.length) return <p className="text-body text-muted">No tasks yet.</p>;
  if (!groups) return <ul className="divide-y divide-border">{[...open, ...done].map((t) => <TaskRow key={t.id} t={t} tz={tz} cards={cards} showJob={showJob} />)}</ul>;
  const by = (k: string) => open.filter((t) => bucket(t.due_at, tz) === k);
  return (
    <div>
      {section("Overdue", by("overdue"))}
      {section("Today", by("today"))}
      {section("Upcoming", by("upcoming"))}
      {section("No date", by("someday"))}
      {section("Done", done.slice(0, 20))}
    </div>
  );
}

// ---------- Interviews ----------

function InterviewDialog({ open, onClose, itemId, interview, tz }: { open: boolean; onClose: () => void; itemId: string; interview?: Interview; tz: string }) {
  const [state, action, pending] = useActionState<TaskState, FormData>(async (prev, form) => {
    const next = await saveInterview(prev, form);
    if (next.doneAt) { onClose(); toast(interview ? "Interview saved" : "Interview added"); }
    return next;
  }, {});
  const k = interview?.id ?? "new";
  return (
    <Modal open={open} onClose={onClose} title={interview ? "Edit interview" : "Add an interview"} footer={
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" form={`iv-form-${k}`} disabled={pending} aria-busy={pending}>{pending ? "Saving" : interview ? "Save interview" : "Add interview"}</Button>
      </>
    }>
      <form id={`iv-form-${k}`} onSubmit={keepValues(action)} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="item_id" value={itemId} />
        {interview ? <input type="hidden" name="id" value={interview.id} /> : null}
        <Field label="What kind" htmlFor={`iv-title-${k}`}>
          <input id={`iv-title-${k}`} name="title" defaultValue={interview?.title ?? ""} maxLength={120} placeholder="Call with the hiring manager" className={inputClass} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" htmlFor={`iv-date-${k}`}><input id={`iv-date-${k}`} name="date" type="date" defaultValue={interview ? dayKey(interview.starts_at, tz) : ""} className={inputClass} /></Field>
          <Field label={`Time (${tz.replace(/_/g, " ")})`} htmlFor={`iv-time-${k}`}><input id={`iv-time-${k}`} name="time" type="time" defaultValue={interview ? timeKey(interview.starts_at, tz) : ""} className={inputClass} /></Field>
        </div>
        <Field label="Meeting link" htmlFor={`iv-link-${k}`}><input id={`iv-link-${k}`} name="meeting_url" defaultValue={interview?.meeting_url ?? ""} placeholder="meet.google.com/abc-defg-hij" className={inputClass} /></Field>
        <Field label="Prep notes" htmlFor={`iv-notes-${k}`}><textarea id={`iv-notes-${k}`} name="notes" defaultValue={interview?.notes ?? ""} maxLength={5000} className={`${textAreaClass} min-h-24`} /></Field>
        {state.error ? <p className="text-meta text-danger" role="alert">{state.error}</p> : null}
      </form>
    </Modal>
  );
}

export function AddInterview({ itemId, tz }: { itemId: string; tz: string }) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  return (
    <>
      <Button variant="outline" onClick={() => { setRound(round + 1); setOpen(true); }}>Add an interview</Button>
      <InterviewDialog key={round} open={open} onClose={() => setOpen(false)} itemId={itemId} tz={tz} />
    </>
  );
}

export function InterviewList({ interviews, tz, showJob = false }: { interviews: Interview[]; tz: string; showJob?: boolean }) {
  const [editing, setEditing] = useState<Interview | null>(null);
  const [now] = useState(() => Date.now());
  if (!interviews.length) return <p className="text-body text-muted">No interviews yet.</p>;
  return (
    <ul className="divide-y divide-border">
      {[...interviews].sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map((iv) => {
        const past = Date.parse(iv.starts_at) < now;
        return (
          <li key={iv.id} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className={`font-bold ${past ? "text-muted" : ""}`}>{iv.title || "Interview"}{showJob && iv.item_title ? <> <span className="font-normal text-muted">for</span> <Link href={`/app/tracker/${iv.item_id}`} className="underline">{iv.item_title}</Link></> : null}</p>
              <p className="text-meta">{relativeDay(iv.starts_at, tz)[0].toUpperCase() + relativeDay(iv.starts_at, tz).slice(1)} at {clock(iv.starts_at, tz)}{past ? " (past)" : ""}</p>
              {iv.meeting_url ? <a href={iv.meeting_url} target="_blank" rel="noopener noreferrer nofollow" className="text-meta underline">Join the meeting</a> : null}
              {iv.notes ? <p className="mt-1 whitespace-pre-line break-words text-meta text-muted">{iv.notes}</p> : null}
            </div>
            <Menu label={`Actions for interview ${iv.title ?? ""}`.trim()} items={[
              { label: "Edit", onSelect: () => setEditing(iv) },
              { label: "Delete", danger: true, onSelect: async () => {
                if (await askConfirm({ title: "Delete this interview?", confirm: "Delete interview", danger: true })) {
                  const r = await deleteInterview(iv.id); toast(r.ok ? "Interview deleted" : "That didn't delete.");
                }
              } },
            ]} />
          </li>
        );
      })}
      {editing ? <InterviewDialog open onClose={() => setEditing(null)} itemId={editing.item_id} interview={editing} tz={tz} /> : null}
    </ul>
  );
}
