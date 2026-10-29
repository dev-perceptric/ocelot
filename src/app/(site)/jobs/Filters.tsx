"use client";

import { Check, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { Floating } from "@/components/Floating";
import { EMPLOYMENT, SENIORITY } from "@/lib/jobs";
import { CITIES, COUNTRIES, countryName, placeName } from "@/lib/places";
import { REGIONS, regionName } from "@/lib/regions";
import { filtersQuery, MIN_PAY, payLabel, POSTED, POSTED_LABEL, type Filters as F } from "@/lib/search";
import { searchHref } from "@/lib/seo";
import { CATEGORIES, categoryName, ROLES, roleName } from "@/lib/taxonomy";

type Option = { value: string; label: string; group?: string };

const WHERE: Option[] = [{ value: "remote", label: "Remote" }, { value: "hybrid", label: "Hybrid" }, { value: "on_site", label: "On-site" }];
const LEVELS = (["entry", "mid", "senior", "lead", "director"] as const).map((l) => ({ value: l, label: SENIORITY[l] }));
const TYPES = (["full_time", "part_time", "contract", "internship"] as const).map((t) => ({ value: t, label: EMPLOYMENT[t] }));
const AREAS: Option[] = [
  ...CATEGORIES.filter((c) => c.slug !== "other").map((c) => ({ value: `c:${c.slug}`, label: `All ${c.name.toLowerCase()}`, group: c.name })),
  ...ROLES.map((r) => ({ value: `r:${r.slug}`, label: r.name, group: CATEGORIES.find((c) => c.slug === r.category)?.name })),
].sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "") || (a.value.startsWith("c:") ? -1 : 1));
// One place at a time: a country people can be hired from, a state or province, or an office city.
const PLACES: Option[] = [
  ...COUNTRIES.map((c) => ({ value: `country:${c.country_code}`, label: c.name, group: "Countries" })),
  ...REGIONS.map((r) => ({ value: `region:${r.code}`, label: r.name, group: r.country === "US" ? "US states" : "Canadian provinces" })),
  ...CITIES.map((c) => ({ value: `city:${c.slug}`, label: c.name, group: "Cities" })),
];
const PAY: Option[] = [{ value: "shown", label: "Shows pay" }, ...MIN_PAY.map((n) => ({ value: String(n), label: payLabel(n) }))];

// A list inside a filter's panel: tick several (multiple) or pick one. Long lists get a search box.
function List({ options, picked, multiple, onPick, label }: { options: Option[]; picked: string[]; multiple?: boolean; onPick: (v: string) => void; label: string }) {
  const [q, setQ] = useState("");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const search = options.length > 10;
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())) : options;
  const move = (e: KeyboardEvent, i: number) => {
    if (e.key === "ArrowDown") { e.preventDefault(); refs.current[Math.min(i + 1, shown.length - 1)]?.focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); if (i <= 0 && search) (e.currentTarget.closest("[data-panel]")?.querySelector("input") as HTMLInputElement | null)?.focus(); else refs.current[Math.max(i - 1, 0)]?.focus(); }
  };
  return (
    <div data-panel className="w-[min(18rem,calc(100vw-16px))]">
      {search ? (
        <div className="border-b border-border p-2">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Find ${label.toLowerCase()}`} placeholder="Type to find"
            onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); refs.current[0]?.focus(); } if (e.key === "Enter" && shown[0]) { e.preventDefault(); onPick(shown[0].value); } }}
            className="h-10 w-full border border-input-border px-3 text-body focus:outline-2 focus:outline-ink rounded-[var(--radius-control)]" />
        </div>
      ) : null}
      <div role="listbox" aria-label={label} aria-multiselectable={multiple || undefined} className="max-h-72 overflow-y-auto py-1">
        {shown.map((o, i) => {
          const on = picked.includes(o.value);
          const head = o.group && o.group !== shown[i - 1]?.group;
          return (
            <div key={o.value}>
              {head ? <p className="px-4 pb-1 pt-3 text-meta font-bold text-muted">{o.group}</p> : null}
              <button ref={(el) => { refs.current[i] = el; }} type="button" role="option" aria-selected={on} autoFocus={!search && i === 0}
                onClick={() => onPick(o.value)} onKeyDown={(e) => move(e, i)}
                className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-body hover:bg-canvas focus:bg-canvas focus:outline-none">
                <span aria-hidden className={`flex size-5 shrink-0 items-center justify-center border ${on ? "border-ink bg-ink text-surface" : "border-input-border"} ${multiple ? "rounded-[3px]" : "rounded-full"}`}>
                  {on ? <Check size={14} strokeWidth={3} /> : null}
                </span>
                {o.label}
              </button>
            </div>
          );
        })}
        {!shown.length ? <p className="px-4 py-3 text-body text-muted">No matches</p> : null}
      </div>
    </div>
  );
}

// One filter in the bar: a button that shows what's picked and opens its list.
function Filter({ label, summary, children, align, active = Boolean(summary) }: {
  label: string; summary: string | null; children: (close: () => void) => React.ReactNode; align?: "start" | "end"; active?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  // By id: the panel's contents get `close` while rendering, before the button's ref can be read.
  const close = () => { setOpen(false); document.getElementById(`${id}-button`)?.focus(); };
  return (
    <>
      <button ref={button} id={`${id}-button`} type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setOpen(!open)}
        className={`inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap border px-3 text-body rounded-[var(--radius-control)] ${active ? "border-ink bg-brand font-bold" : "border-border bg-surface hover:border-ink"}`}>
        {summary ? <span className="sr-only">{label}: </span> : null}
        {summary ?? label}
        <ChevronDown size={16} strokeWidth={2} aria-hidden />
      </button>
      <Floating anchor={button} open={open} onClose={() => setOpen(false)} id={`${id}-panel`} label={label} align={align}>
        <div onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); close(); } }}>{children(close)}</div>
      </Floating>
    </>
  );
}

const several = (labels: string[]) => (labels.length ? (labels.length > 1 ? `${labels[0]} +${labels.length - 1}` : labels[0]) : null);

// The filter bar under the search box. Every change updates the address, so filters can be shared and the back
// button works. A search with a role and place page of its own goes there (/sales-jobs-in-texas).
export function FilterBar({ filters: fromUrl, companies }: { filters: F; companies: { name: string; slug: string }[] }) {
  const router = useRouter();
  // Shown at once while the new results load, then follows the address (e.g. after removing a tag).
  const [filters, setFilters] = useState(fromUrl);
  const [seen, setSeen] = useState(filtersQuery(fromUrl));
  if (filtersQuery(fromUrl) !== seen) {
    setSeen(filtersQuery(fromUrl));
    setFilters(fromUrl);
  }
  const [loading, start] = useTransition();
  const go = (next: Partial<F>) => {
    const f = { ...filters, ...next };
    setFilters(f);
    start(() => router.push(searchHref(f), { scroll: false }));
  };
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const place = filters.city ? `city:${filters.city}` : filters.region ? `region:${filters.region}` : filters.country ? `country:${filters.country}` : "";
  const area = filters.role ? `r:${filters.role}` : filters.category ? `c:${filters.category}` : "";
  const pay = filters.minPay ? String(filters.minPay) : filters.pay ? "shown" : "";
  const companyName = companies.find((c) => c.slug === filters.company)?.name ?? filters.company;

  return (
    <div role="group" aria-label="Filters" aria-busy={loading} className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
      <Filter label="Workplace" summary={several(WHERE.filter((w) => filters.where.includes(w.value)).map((w) => w.label))}>
        {() => <List label="Workplace" multiple options={WHERE} picked={filters.where} onPick={(v) => go({ where: toggle(filters.where, v) })} />}
      </Filter>
      <Filter label="Location" summary={filters.city ? placeName(filters.city) : filters.region ? regionName(filters.region) : filters.country ? countryName(filters.country) : null}>
        {(close) => (
          <List label="Location" options={[{ value: "", label: "Anywhere" }, ...PLACES]} picked={[place]} onPick={(v) => {
            const [kind, code] = v.split(":");
            go({ country: kind === "country" ? code : null, region: kind === "region" ? code : null, city: kind === "city" ? code : null });
            close();
          }} />
        )}
      </Filter>
      <Filter label="Area" summary={filters.role ? roleName(filters.role) : filters.category ? categoryName(filters.category) : null}>
        {(close) => (
          <List label="Area" options={[{ value: "", label: "Any area" }, ...AREAS]} picked={[area]} onPick={(v) => {
            go(v.startsWith("r:") ? { role: v.slice(2), category: null } : { role: null, category: v ? v.slice(2) : null });
            close();
          }} />
        )}
      </Filter>
      <Filter label="Seniority" summary={several(LEVELS.filter((l) => filters.level.includes(l.value)).map((l) => l.label))}>
        {() => <List label="Seniority" multiple options={LEVELS} picked={filters.level} onPick={(v) => go({ level: toggle(filters.level, v) })} />}
      </Filter>
      <Filter label="Type" summary={several(TYPES.filter((t) => filters.type.includes(t.value)).map((t) => t.label))}>
        {() => <List label="Type" multiple options={TYPES} picked={filters.type} onPick={(v) => go({ type: toggle(filters.type, v) })} />}
      </Filter>
      <Filter label="Pay" summary={filters.minPay ? payLabel(filters.minPay) : filters.pay ? "Shows pay" : null}>
        {(close) => (
          <List label="Pay" options={[{ value: "", label: "Any pay" }, ...PAY]} picked={[pay]} onPick={(v) => {
            go(v === "shown" ? { pay: true, minPay: null } : { pay: false, minPay: v ? Number(v) : null });
            close();
          }} />
        )}
      </Filter>
      <Filter label="Posted" summary={filters.posted ? POSTED_LABEL[filters.posted] : null}>
        {(close) => (
          <List label="Posted" options={[{ value: "", label: "Any time" }, ...POSTED.map((d) => ({ value: String(d), label: POSTED_LABEL[d] }))]}
            picked={[filters.posted ? String(filters.posted) : ""]} onPick={(v) => { go({ posted: v ? Number(v) : null }); close(); }} />
        )}
      </Filter>
      <Filter label="Company" summary={filters.company ? companyName : null}>
        {(close) => (
          <List label="Company" options={[{ value: "", label: "Any company" }, ...companies.map((c) => ({ value: c.slug, label: c.name }))]}
            picked={[filters.company ?? ""]} onPick={(v) => { go({ company: v || null }); close(); }} />
        )}
      </Filter>
    </div>
  );
}

// Best match takes turns between companies; Newest is newest first.
export function SortPicker({ filters }: { filters: F }) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <Filter label="Sort" summary={filters.sort === "new" ? "Newest" : "Best match"} active={false} align="end">
      {(close) => (
        <List label="Sort" options={[{ value: "best", label: "Best match" }, { value: "new", label: "Newest" }]} picked={[filters.sort]}
          onPick={(v) => { close(); start(() => router.push(searchHref({ ...filters, sort: v === "new" ? "new" : "best" }), { scroll: false })); }} />
      )}
    </Filter>
  );
}
