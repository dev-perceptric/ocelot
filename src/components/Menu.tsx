"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Floating } from "@/components/Floating";

export type MenuItem = { label: string; onSelect?: () => void; href?: string; danger?: boolean; disabled?: boolean };

// Row actions behind a "…" button. Arrow keys move, Enter picks, Esc closes.
export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const refs = useRef<(HTMLElement | null)[]>([]);

  const focus = (i: number) => { setActive(i); refs.current[i]?.focus(); };
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const openMenu = (at = 0) => { setOpen(true); setTimeout(() => focus(at), 0); };

  const onKey = (e: KeyboardEvent) => {
    const last = items.length - 1;
    if (e.key === "ArrowDown") { e.preventDefault(); focus(active >= last ? 0 : active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focus(active <= 0 ? last : active - 1); }
    else if (e.key === "Home") { e.preventDefault(); focus(0); }
    else if (e.key === "End") { e.preventDefault(); focus(last); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") setOpen(false);
  };

  const cls = (it: MenuItem) =>
    `flex min-h-11 w-full items-center px-4 text-left text-body hover:bg-canvas focus:bg-canvas focus:outline-none disabled:text-muted ${it.danger ? "text-danger" : ""}`;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); openMenu(0); } }}
        className="flex size-11 items-center justify-center hover:bg-canvas rounded-[var(--radius-control)]"
      >
        <MoreHorizontal size={20} strokeWidth={1.75} aria-hidden />
      </button>
      <Floating anchor={trigger} open={open} onClose={() => setOpen(false)} align="end" id={`${id}-menu`} role="menu" label={label}>
        <div onKeyDown={onKey}>
          {items.map((it, i) =>
            it.href ? (
              <Link key={it.label} ref={(el) => { refs.current[i] = el; }} role="menuitem" href={it.href} tabIndex={-1} className={cls(it)} onClick={() => setOpen(false)}>
                {it.label}
              </Link>
            ) : (
              <button
                key={it.label}
                ref={(el) => { refs.current[i] = el; }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={it.disabled}
                className={cls(it)}
                onClick={() => { close(); it.onSelect?.(); }}
              >
                {it.label}
              </button>
            ),
          )}
        </div>
      </Floating>
    </>
  );
}
