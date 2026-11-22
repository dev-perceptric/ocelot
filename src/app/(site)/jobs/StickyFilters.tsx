"use client";

import { Search, X } from "lucide-react";
import { useState } from "react";
import type { Filters as F } from "@/lib/search";
import { filtersQuery } from "@/lib/search";
import { FilterBar } from "./Filters";
import { SearchBox } from "./SearchBox";

// The bar that stays at the top while the job list scrolls: a Search button and the filters. Search opens the search
// box inside the bar (keeping the filters), so people can search again without scrolling back up; the X closes it.
export function StickyFilters({ filters, end }: { filters: F; end?: React.ReactNode }) {
  const [searching, setSearching] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setSearching(!searching)} aria-expanded={searching} aria-label={searching ? "Close search" : "Search jobs"}
          className={`flex size-10 shrink-0 items-center justify-center border rounded-[var(--radius-control)] ${searching ? "border-ink bg-brand" : "border-border bg-surface hover:border-ink"}`}>
          {searching ? <X size={18} strokeWidth={2} aria-hidden /> : <Search size={18} strokeWidth={2} aria-hidden />}
        </button>
        <div className="min-w-0 flex-1"><FilterBar filters={filters} /></div>
        {end}
      </div>
      {searching ? (
        <SearchBox key={filters.q} q={filters.q} keep={[...new URLSearchParams(filtersQuery({ ...filters, q: "" }).slice(1))]} autoFocus />
      ) : null}
    </div>
  );
}
