"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button, inputClass } from "@/components/ui";

// A modal on the browser's <dialog>: the page behind it can't be reached, Esc closes it, and focus goes back
// to the button that opened it. Never use window.alert, confirm or prompt.
export function Modal({ open, onClose, title, children, footer, size = "md" }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d || !open) return;
    // Focus goes back to whatever opened the dialog, also when the dialog is removed from the page.
    const before = document.activeElement as HTMLElement | null;
    if (!d.open) d.showModal();
    return () => {
      if (d.open) d.close();
      before?.focus();
    };
  }, [open]);

  const width = { sm: "max-w-[420px]", md: "max-w-[560px]", lg: "max-w-[800px]" }[size];
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={`m-auto w-[calc(100%-32px)] ${width} bg-surface p-0 text-ink backdrop:bg-ink/40 rounded-[var(--radius-card)]`}
    >
      <div className="flex items-start justify-between gap-4 px-6 pt-6">
        <h2 id="dialog-title" className="text-card font-bold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 flex size-11 items-center justify-center hover:bg-canvas rounded-[var(--radius-control)]">
          <X size={20} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      {children ? <div className="px-6 pt-3 text-body">{children}</div> : null}
      {footer ? <div className="flex flex-wrap justify-end gap-3 px-6 pt-6 pb-6">{footer}</div> : <div className="pb-6" />}
    </dialog>
  );
}

// ---------- askConfirm, askText, tell: one-line questions from anywhere, answered in the app's own dialog ----------

type Ask =
  | { kind: "confirm"; title: string; body?: string; confirm: string; danger: boolean; resolve: (v: boolean) => void }
  | { kind: "text"; title: string; label: string; initial: string; confirm: string; resolve: (v: string | null) => void }
  | { kind: "tell"; title: string; body?: string; resolve: () => void };

let current: Ask | null = null;
const listeners = new Set<() => void>();
const show = (a: Ask | null) => { current = a; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function askConfirm(o: { title: string; body?: string; confirm?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => show({ kind: "confirm", title: o.title, body: o.body, confirm: o.confirm ?? "Confirm", danger: o.danger ?? false, resolve }));
}
export function askText(o: { title: string; label: string; initial?: string; confirm?: string }): Promise<string | null> {
  return new Promise((resolve) => show({ kind: "text", title: o.title, label: o.label, initial: o.initial ?? "", confirm: o.confirm ?? "Save", resolve }));
}
export function tell(o: { title: string; body?: string }): Promise<void> {
  return new Promise((resolve) => show({ kind: "tell", title: o.title, body: o.body, resolve }));
}

// Mounted once in the root layout.
export function DialogHost() {
  const ask = useSyncExternalStore(subscribe, () => current, () => null);

  if (!ask) return null;
  const done = (v?: boolean | string | null) => {
    if (ask.kind === "confirm") ask.resolve(Boolean(v));
    else if (ask.kind === "text") ask.resolve(typeof v === "string" ? v : null);
    else ask.resolve();
    show(null);
  };

  if (ask.kind === "tell") {
    return (
      <Modal open onClose={() => done()} title={ask.title} size="sm" footer={<Button onClick={() => done()}>OK</Button>}>
        {ask.body}
      </Modal>
    );
  }
  if (ask.kind === "confirm") {
    return (
      <Modal open onClose={() => done(false)} title={ask.title} size="sm" footer={
        <>
          <Button variant="ghost" onClick={() => done(false)}>Cancel</Button>
          <Button variant={ask.danger ? "danger" : "primary"} onClick={() => done(true)} autoFocus>{ask.confirm}</Button>
        </>
      }>
        {ask.body}
      </Modal>
    );
  }
  return <TextAsk key={ask.title + ask.initial} ask={ask} done={done} />;
}

function TextAsk({ ask, done }: { ask: Extract<Ask, { kind: "text" }>; done: (v: string | null) => void }) {
  const [text, setText] = useState(ask.initial);
  return (
    <Modal open onClose={() => done(null)} title={ask.title} size="sm" footer={
      <>
        <Button variant="ghost" onClick={() => done(null)}>Cancel</Button>
        <Button type="submit" form="ask-text" disabled={!text.trim()}>{ask.confirm}</Button>
      </>
    }>
      <form id="ask-text" onSubmit={(e) => { e.preventDefault(); if (text.trim()) done(text.trim()); }} className="flex flex-col gap-2">
        <label htmlFor="ask-text-input" className="text-meta font-bold">{ask.label}</label>
        <input id="ask-text-input" autoFocus value={text} onChange={(e) => setText(e.target.value)} className={inputClass} />
      </form>
    </Modal>
  );
}
