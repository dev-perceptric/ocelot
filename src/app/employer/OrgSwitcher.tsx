"use client";

import { Select } from "@/components/Select";
import { switchOrg } from "./switch";

export function OrgSwitcher({ orgs, current }: { orgs: { id: string; name: string }[]; current: string }) {
  return (
    <Select
      aria-label="Company"
      options={orgs.map((o) => ({ value: o.id, label: o.name }))}
      value={current}
      onChange={(id) => { if (id && id !== current) void switchOrg(id); }}
    />
  );
}
