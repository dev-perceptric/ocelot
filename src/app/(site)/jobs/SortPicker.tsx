"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/Select";
import { filtersQuery, type Filters as F } from "@/lib/search";

// Best match takes turns between companies; Newest is newest first.
export function SortPicker({ filters }: { filters: F }) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <div className="w-36">
      <Select aria-label="Sort jobs" options={[{ value: "best", label: "Best match" }, { value: "new", label: "Newest" }]}
        value={filters.sort} onChange={(v) => start(() => router.push(`/jobs${filtersQuery({ ...filters, sort: v === "new" ? "new" : "best" })}`, { scroll: false }))} />
    </div>
  );
}
