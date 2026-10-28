import Link from "next/link";

// Page sections with their own address (?tab=...), so a tab can be linked and survives a reload.
export function Tabs({ items, current, base }: { items: { key: string; label: string }[]; current: string; base: string }) {
  return (
    <nav aria-label="Sections" className="flex gap-1 overflow-x-auto border-b border-border">
      {items.map((t) => {
        const on = t.key === current;
        return (
          <Link
            key={t.key}
            href={`${base}?tab=${t.key}`}
            aria-current={on ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-body font-bold ${on ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
