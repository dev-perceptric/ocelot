import Link from "next/link";

// Page sections with their own address (?tab=...), so a tab can be linked and survives a reload.
// Pass href to keep other parts of the address (filters) when switching.
export function Tabs({ items, current, base, href }: { items: { key: string; label: string }[]; current: string; base: string; href?: (key: string) => string }) {
  return (
    <nav aria-label="Sections" className="flex gap-1 overflow-x-auto border-b border-border">
      {items.map((t) => {
        const on = t.key === current;
        return (
          <Link
            key={t.key}
            href={href ? href(t.key) : `${base}?tab=${t.key}`}
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
