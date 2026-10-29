"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Select } from "@/components/Select";
import { Button, Checkbox } from "@/components/ui";
import { EMPLOYMENT, SENIORITY } from "@/lib/jobs";
import { CITIES, COUNTRIES } from "@/lib/places";
import { filtersQuery, MIN_PAY, payLabel, POSTED, POSTED_LABEL, type Filters as F } from "@/lib/search";
import { REGIONS } from "@/lib/regions";
import { CATEGORIES, ROLES } from "@/lib/taxonomy";

const WHERE = [{ value: "remote", label: "Remote" }, { value: "hybrid", label: "Hybrid" }, { value: "on_site", label: "On-site" }];
const areaOptions = [
  ...CATEGORIES.filter((c) => c.slug !== "other").map((c) => ({ value: `c:${c.slug}`, label: `All ${c.name.toLowerCase()}`, group: c.name })),
  ...ROLES.map((r) => ({ value: `r:${r.slug}`, label: r.name, group: CATEGORIES.find((c) => c.slug === r.category)?.name })),
].sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "") || (a.value.startsWith("c:") ? -1 : 1));

// The filter panel: a column beside the results on wide screens, a full-screen sheet on phones.
// Every change updates the address, so filters can be shared and the back button works.
export function Filters({ filters: fromUrl, total, companies }: { filters: F; total: number; companies: { name: string; slug: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Shown at once while the new results load, then follows the address (e.g. after removing a tag).
  // Kept in this component, not remounted, so the phone sheet stays open between changes.
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
    start(() => router.push(`/jobs${filtersQuery(f)}`, { scroll: false }));
  };
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const panel = (
    <div className="flex flex-col gap-6">
      <fieldset>
        <legend className="mb-1 text-meta font-bold">Workplace</legend>
        {WHERE.map((w) => (
          <Checkbox key={w.value} id={`where-${w.value}`} label={w.label} checked={filters.where.includes(w.value)}
            onChange={() => go({ where: toggle(filters.where, w.value) })} />
        ))}
      </fieldset>
      <div>
        <label htmlFor="f-country" className="text-meta font-bold">Hiring people in</label>
        <div className="mt-2">
          <Select id="f-country" placeholder="Any country" options={[{ value: "", label: "Any country" }, ...COUNTRIES.map((c) => ({ value: c.country_code, label: c.name }))]}
            value={filters.country ?? ""} onChange={(v) => go({ country: v || null })} />
        </div>
      </div>
      <div>
        <label htmlFor="f-region" className="text-meta font-bold">State or province</label>
        <div className="mt-2">
          <Select id="f-region" placeholder="Any state or province" searchable
            options={[{ value: "", label: "Any state or province" }, ...REGIONS.filter((r) => !filters.country || r.country === filters.country)
              .map((r) => ({ value: r.code, label: r.name, group: r.country === "US" ? "United States" : "Canada" }))]}
            value={filters.region ?? ""} onChange={(v) => go({ region: v || null })} />
        </div>
      </div>
      <div>
        <label htmlFor="f-city" className="text-meta font-bold">Office city</label>
        <div className="mt-2">
          <Select id="f-city" placeholder="Any city" options={[{ value: "", label: "Any city" }, ...CITIES.map((c) => ({ value: c.slug, label: c.name, group: COUNTRIES.find((k) => k.country_code === c.country_code)?.name }))]}
            value={filters.city ?? ""} onChange={(v) => go({ city: v || null })} />
        </div>
      </div>
      <div>
        <label htmlFor="f-area" className="text-meta font-bold">Area</label>
        <div className="mt-2">
          <Select id="f-area" placeholder="Any area" options={[{ value: "", label: "Any area" }, ...areaOptions]}
            value={filters.role ? `r:${filters.role}` : filters.category ? `c:${filters.category}` : ""}
            onChange={(v) => go(v?.startsWith("r:") ? { role: v.slice(2), category: null } : { role: null, category: v ? v.slice(2) : null })} />
        </div>
      </div>
      <div>
        <label htmlFor="f-company" className="text-meta font-bold">Company</label>
        <div className="mt-2">
          <Select id="f-company" placeholder="Any company" searchable options={[{ value: "", label: "Any company" }, ...companies.map((c) => ({ value: c.slug, label: c.name }))]}
            value={filters.company ?? ""} onChange={(v) => go({ company: v || null })} />
        </div>
      </div>
      <div>
        <label htmlFor="f-posted" className="text-meta font-bold">Posted</label>
        <div className="mt-2">
          <Select id="f-posted" placeholder="Any time" options={[{ value: "", label: "Any time" }, ...POSTED.map((d) => ({ value: String(d), label: POSTED_LABEL[d] }))]}
            value={filters.posted ? String(filters.posted) : ""} onChange={(v) => go({ posted: v ? Number(v) : null })} />
        </div>
      </div>
      <div>
        <label htmlFor="f-min-pay" className="text-meta font-bold">Pay</label>
        <div className="mt-2">
          <Select id="f-min-pay" placeholder="Any pay" options={[{ value: "", label: "Any pay" }, ...MIN_PAY.map((n) => ({ value: String(n), label: payLabel(n) }))]}
            value={filters.minPay ? String(filters.minPay) : ""} onChange={(v) => go({ minPay: v ? Number(v) : null })} />
        </div>
      </div>
      <fieldset>
        <legend className="mb-1 text-meta font-bold">Seniority</legend>
        {(["entry", "mid", "senior", "lead", "director"] as const).map((l) => (
          <Checkbox key={l} id={`level-${l}`} label={SENIORITY[l]} checked={filters.level.includes(l)} onChange={() => go({ level: toggle(filters.level, l) })} />
        ))}
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-meta font-bold">Type</legend>
        {(["full_time", "part_time", "contract", "internship"] as const).map((t) => (
          <Checkbox key={t} id={`type-${t}`} label={EMPLOYMENT[t]} checked={filters.type.includes(t)} onChange={() => go({ type: toggle(filters.type, t) })} />
        ))}
      </fieldset>
      <Checkbox id="f-pay" label="Shows pay" checked={filters.pay} onChange={() => go({ pay: !filters.pay })} />
    </div>
  );

  return (
    <>
      <div className="md:hidden">
        <Button variant="outline" onClick={() => setOpen(true)} className="w-full">
          <SlidersHorizontal size={20} strokeWidth={1.75} aria-hidden />Filters
        </Button>
      </div>
      {open ? (
        <div role="dialog" aria-modal="true" aria-label="Filters" className="fixed inset-0 z-40 flex flex-col bg-surface md:hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-card font-bold">Filters</h2>
            <button type="button" aria-label="Close filters" onClick={() => setOpen(false)} className="flex size-11 items-center justify-center"><X size={22} aria-hidden /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-6">{panel}</div>
          <div className="border-t border-border p-4">
            <Button className="w-full" disabled={loading} aria-busy={loading} onClick={() => setOpen(false)}>
              {loading ? "Updating" : `Show ${total === 1 ? "1 job" : `${total.toLocaleString("en-US")} jobs`}`}
            </Button>
          </div>
        </div>
      ) : null}
      <aside aria-label="Filters" aria-busy={loading} className="hidden md:block">{panel}</aside>
    </>
  );
}
