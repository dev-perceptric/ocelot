"use client";

import { useSyncExternalStore } from "react";

// Short confirmations ("Saved", "Invite sent"). Read out by screen readers. Errors stay next to the field instead.
type Item = { id: number; text: string };
let items: Item[] = [];
let next = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function toast(text: string) {
  const id = next++;
  items = [...items, { id, text }];
  emit();
  setTimeout(() => { items = items.filter((i) => i.id !== id); emit(); }, 4000);
}

const empty: Item[] = [];

export function ToastHost() {
  const list = useSyncExternalStore(subscribe, () => items, () => empty);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4">
      {list.map((t) => (
        <p key={t.id} className="bg-ink px-4 py-3 text-meta font-bold text-surface rounded-[var(--radius-control)]">{t.text}</p>
      ))}
    </div>
  );
}
