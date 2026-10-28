"use client";

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

// Menus and dropdown lists open on a layer above the whole page, so no card or table can cut them off.
// Placed under the anchor, or above it when there's more room there. Closes on Esc or a click outside.
export function Floating({ anchor, open, onClose, children, matchWidth = false, align = "start", label, id, role }: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  matchWidth?: boolean;
  align?: "start" | "end";
  label?: string;
  id?: string;
  role?: string;
}) {
  const box = useRef<HTMLDivElement>(null);

  // Position is written straight to the element: it follows the anchor on scroll and resize without re-rendering.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const el = box.current;
      if (!a || !el) return;
      const below = window.innerHeight - a.bottom - 8;
      const above = a.top - 8;
      const up = below < 240 && above > below;
      const width = matchWidth ? a.width : null;
      Object.assign(el.style, {
        left: align === "end" ? "" : `${Math.max(8, Math.min(a.left, window.innerWidth - (width ?? 220) - 8))}px`,
        right: align === "end" ? `${Math.max(8, window.innerWidth - a.right)}px` : "",
        top: up ? "" : `${a.bottom + 4}px`,
        bottom: up ? `${window.innerHeight - a.top + 4}px` : "",
        width: width ? `${width}px` : "",
        minWidth: width ? "" : "200px",
        maxHeight: `${Math.min(320, Math.max(120, up ? above : below))}px`,
      });
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, anchor, matchWidth, align, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={box}
      id={id}
      role={role}
      aria-label={label}
      // Starts off-screen (still focusable) until the layout effect places it.
      style={{ position: "fixed", left: -9999, top: 0 }}
      className="z-50 overflow-auto border border-border bg-surface py-1 shadow-[0_8px_24px_rgba(26,26,26,0.12)] rounded-[var(--radius-card)]"
    >
      {children}
    </div>,
    document.body,
  );
}
