"use client";

import { Building2, Clock, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Button, inputClass } from "@/components/ui";
import { suggest, type Suggestion } from "./actions";

// The Find jobs search box. While someone types it suggests job titles and companies with live jobs; an empty box
// offers the last searches made on this device. Arrow keys move through the list, Enter picks, Esc closes.
// Give it key={q} so a new search starts from the new words.
const RECENT_KEY = "ocelot:recent-searches";

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 6) : [];
  } catch { return []; }
}
function remember(q: string) {
  const text = q.trim();
  if (!text) return;
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([text, ...readRecent().filter((x) => x.toLowerCase() !== text.toLowerCase())].slice(0, 6))); } catch {}
}

type Option = { key: string; label: string; meta?: string; kind: "title" | "company" | "recent"; go: () => void };

export function SearchBox({ q = "", keep = [], className = "" }: { q?: string; keep?: [string, string][]; className?: string }) {
  const router = useRouter();
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(q);
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<{ for: string; items: Suggestion[] }>({ for: "", items: [] });
  const [recent, setRecent] = useState<string[]>([]);
  const [active, setActive] = useState(-1);

  // Ask for suggestions a moment after typing stops.
  useEffect(() => {
    const t = text.trim();
    if (t.length < 2 || !open) return;
    let live = true;
    const timer = setTimeout(() => { suggest(t).then((items) => { if (live) setFound({ for: t, items }); }).catch(() => {}); }, 150);
    return () => { live = false; clearTimeout(timer); };
  }, [text, open]);

  const submit = (value: string) => {
    setText(value);
    setOpen(false);
    remember(value);
    const params = new URLSearchParams(keep);
    if (value.trim()) params.set("q", value.trim());
    router.push(`/jobs${params.size ? `?${params}` : ""}`);
  };

  const typed = text.trim();
  const options: Option[] = typed.length >= 2
    ? (found.for === typed ? found.items : []).map((s) => s.kind === "company"
      ? { key: `c:${s.slug}`, label: s.label, meta: `Company, ${s.jobs.toLocaleString("en-US")} ${s.jobs === 1 ? "job" : "jobs"}`, kind: "company" as const, go: () => { setOpen(false); router.push(`/companies/${s.slug}`); } }
      : { key: `t:${s.label}`, label: s.label, meta: `${s.jobs.toLocaleString("en-US")} ${s.jobs === 1 ? "job" : "jobs"}`, kind: "title" as const, go: () => submit(s.label) })
    : typed ? [] : recent.map((r) => ({ key: `r:${r}`, label: r, kind: "recent" as const, go: () => submit(r) }));
  const showing = open && options.length > 0;

  return (
    <form ref={formRef} action="/jobs" role="search" className={`relative flex max-w-[860px] flex-col gap-3 sm:flex-row ${className}`}
      onSubmit={(e) => { e.preventDefault(); submit(text); }}>
      <div className="relative w-full">
        <label htmlFor={`${id}-q`} className="sr-only">Role, company, or keyword</label>
        <input ref={inputRef} id={`${id}-q`} name="q" value={text} placeholder="Role, company, or keyword" autoComplete="off"
          role="combobox" aria-expanded={showing} aria-controls={`${id}-list`} aria-autocomplete="list"
          aria-activedescendant={showing && active >= 0 ? `${id}-o${active}` : undefined}
          className={inputClass}
          onChange={(e) => { setText(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => { setRecent(readRecent()); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); return; }
            if (!showing) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % options.length); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a <= 0 ? options.length - 1 : a - 1)); }
            else if (e.key === "Enter" && active >= 0) { e.preventDefault(); options[active].go(); }
          }} />
        {keep.map(([k, v]) => <input key={`${k}=${v}`} type="hidden" name={k} value={v} />)}
        {showing ? (
          <ul id={`${id}-list`} role="listbox" aria-label={typed ? "Suggestions" : "Recent searches"}
            className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden border border-border bg-surface py-1 shadow-sm rounded-[var(--radius-card)]">
            {!typed ? (
              <li role="presentation" className="flex items-center justify-between px-4 py-1 text-label font-bold text-muted">
                Recent searches
                <button type="button" className="text-label underline" onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { try { localStorage.removeItem(RECENT_KEY); } catch {} setRecent([]); }}>Clear</button>
              </li>
            ) : null}
            {options.map((o, i) => (
              <li key={o.key} id={`${id}-o${i}`} role="option" aria-selected={i === active}
                className={`flex cursor-pointer items-center gap-3 px-4 py-2 text-body ${i === active ? "bg-canvas" : "hover:bg-canvas"}`}
                onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={o.go}>
                {o.kind === "company" ? <Building2 size={18} strokeWidth={1.75} aria-hidden className="shrink-0 text-muted" />
                  : o.kind === "recent" ? <Clock size={18} strokeWidth={1.75} aria-hidden className="shrink-0 text-muted" />
                  : <Search size={18} strokeWidth={1.75} aria-hidden className="shrink-0 text-muted" />}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.meta ? <span className="shrink-0 text-meta text-muted">{o.meta}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <Button type="submit" className="h-12 sm:w-56">Find jobs</Button>
    </form>
  );
}
