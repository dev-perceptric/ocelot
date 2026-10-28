"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Floating } from "@/components/Floating";

export type Option = { value: string; label: string; group?: string };

type Props = {
  options: Option[];
  id?: string;
  name?: string; // set to post the value with a form (hidden inputs)
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
  searchable?: boolean; // defaults to on for long lists
} & (
  | { multiple?: false; value?: string | null; defaultValue?: string | null; onChange?: (v: string | null) => void }
  | { multiple: true; value?: string[]; defaultValue?: string[]; onChange?: (v: string[]) => void }
);

// The app's dropdown. Keyboard: Enter, Space or arrows open it; arrows move; Enter picks; Esc closes;
// typing jumps to a match (or filters, in long lists). Never use the browser's <select>.
export function Select(props: Props) {
  const { options, name, placeholder = "Choose", disabled, invalid } = props;
  const multiple = props.multiple === true;
  const autoId = useId();
  const id = props.id ?? autoId;
  const listId = `${id}-list`;

  const initial = (props.value ?? props.defaultValue ?? (multiple ? [] : null)) as string | string[] | null;
  const [own, setOwn] = useState(initial);
  const current = props.value !== undefined ? (props.value as string | string[] | null) : own;
  const picked = useMemo(() => new Set(multiple ? ((current as string[]) ?? []) : current ? [current as string] : []), [current, multiple]);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const typed = useRef({ text: "", at: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const searchable = props.searchable ?? options.length > 10;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const commit = (next: string | string[] | null) => {
    setOwn(next);
    (props.onChange as ((v: string | string[] | null) => void) | undefined)?.(next);
  };

  const pick = (o: Option) => {
    if (multiple) {
      const list = [...picked];
      commit(picked.has(o.value) ? list.filter((v) => v !== o.value) : [...list, o.value]);
    } else {
      commit(o.value);
      close();
    }
  };

  const openList = () => {
    if (disabled) return;
    const first = shown.findIndex((o) => picked.has(o.value));
    setActive(Math.max(0, first));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setQuery("");
    trigger.current?.focus();
  };

  const onKey = (e: KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    const last = shown.length - 1;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(last, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(last); }
    else if (e.key === "Enter" || (e.key === " " && !searchable)) { e.preventDefault(); if (shown[active]) pick(shown[active]); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") { setOpen(false); setQuery(""); }
    else if (!searchable && e.key.length === 1) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 600 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const hit = shown.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
      if (hit >= 0) setActive(hit);
    }
  };

  const labels = options.filter((o) => picked.has(o.value)).map((o) => o.label);
  const text = labels.length ? (multiple && labels.length > 2 ? `${labels.slice(0, 2).join(", ")} +${labels.length - 2}` : labels.join(", ")) : "";

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && !searchable && shown[active] ? `${id}-o-${active}` : undefined}
        aria-label={props["aria-label"]}
        aria-describedby={props["aria-describedby"]}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKey}
        className={`flex h-12 w-full items-center justify-between gap-2 rounded-[var(--radius-control)] border bg-surface px-4 text-left text-body disabled:bg-canvas disabled:text-muted ${invalid ? "border-danger" : "border-input-border"}`}
      >
        <span className={`truncate ${text ? "" : "text-muted"}`}>{text || placeholder}</span>
        <ChevronDown size={20} strokeWidth={1.75} aria-hidden className="shrink-0" />
      </button>
      {name
        ? [...picked].map((v) => <input key={v} type="hidden" name={name} value={v} />)
        : null}
      {name && picked.size === 0 ? <input type="hidden" name={name} value="" /> : null}

      <Floating anchor={trigger} open={open} onClose={() => { setOpen(false); setQuery(""); }} matchWidth>
        {searchable ? (
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onKey}
              placeholder="Type to filter"
              aria-label="Filter options"
              aria-controls={listId}
              aria-activedescendant={shown[active] ? `${id}-o-${active}` : undefined}
              className="h-9 w-full bg-transparent text-body outline-none"
            />
            {query ? (
              <button type="button" aria-label="Clear filter" onClick={() => setQuery("")}><X size={16} aria-hidden /></button>
            ) : null}
          </div>
        ) : null}
        <ul id={listId} role="listbox" aria-multiselectable={multiple || undefined} aria-labelledby={id}>
          {shown.map((o, i) => {
            const groupStart = o.group && o.group !== shown[i - 1]?.group;
            return (
              <li key={o.value} role="presentation">
                {groupStart ? <p className="px-4 pt-3 pb-1 text-label font-bold text-muted">{o.group}</p> : null}
                <div
                  id={`${id}-o-${i}`}
                  role="option"
                  aria-selected={picked.has(o.value)}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o)}
                  className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 text-body ${i === active ? "bg-canvas" : ""}`}
                >
                  <span>{o.label}</span>
                  {picked.has(o.value) ? <Check size={18} strokeWidth={2} aria-hidden /> : null}
                </div>
              </li>
            );
          })}
          {shown.length === 0 ? <li className="px-4 py-3 text-body text-muted">No matches</li> : null}
        </ul>
      </Floating>
    </>
  );
}
