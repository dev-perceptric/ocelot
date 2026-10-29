"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { askConfirm } from "@/components/Dialog";
import { Select } from "@/components/Select";
import { toast } from "@/components/Toast";
import { IconButton } from "@/components/ui";
import { deleteSearch, setSearchFrequency } from "./searches";

type Search = { id: string; name: string; href: string; frequency: string };
const OPTIONS = [{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "off", label: "Off" }];

export function SavedSearches({ searches }: { searches: Search[] }) {
  const [list, setList] = useState(searches);
  const change = async (s: Search, frequency: string | null) => {
    if (!frequency || frequency === s.frequency) return;
    setList((l) => l.map((x) => (x.id === s.id ? { ...x, frequency } : x)));
    const r = await setSearchFrequency(s.id, frequency);
    if (r.ok) toast("Saved");
    else { setList((l) => l.map((x) => (x.id === s.id ? s : x))); toast(r.message ?? "That didn't save. Try again."); }
  };
  const remove = async (s: Search) => {
    if (!(await askConfirm({ title: `Delete ${s.name}?`, confirm: "Delete search", danger: true }))) return;
    const r = await deleteSearch(s.id);
    if (r.ok) { setList((l) => l.filter((x) => x.id !== s.id)); toast("Search deleted"); }
    else toast(r.message ?? "That didn't delete. Try again.");
  };
  return (
    <ul className="flex max-w-[560px] flex-col divide-y divide-border">
      {list.map((s) => (
        <li key={s.id} className="flex min-h-14 items-center gap-3 py-2">
          <Link href={s.href} className="min-w-0 flex-1 truncate font-bold hover:underline">{s.name}</Link>
          <div className="w-32"><Select aria-label={`How often for ${s.name}`} value={s.frequency} options={OPTIONS} onChange={(v) => change(s, v)} /></div>
          <IconButton label={`Delete ${s.name}`} onClick={() => remove(s)}><Trash2 size={18} strokeWidth={1.75} aria-hidden /></IconButton>
        </li>
      ))}
    </ul>
  );
}
