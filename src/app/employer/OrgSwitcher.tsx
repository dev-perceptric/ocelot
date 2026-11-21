"use client";

import { Select } from "@/components/Select";
import { switchAgency } from "./agency/actions";
import { switchOrg } from "./switch";

// Companies, with an agency's clients grouped under the agency's name.
export function OrgSwitcher({ orgs, current }: { orgs: { id: string; name: string; group?: string }[]; current: string }) {
  return (
    <Select
      aria-label="Company"
      options={orgs.map((o) => ({ value: o.id, label: o.name, group: o.group }))}
      value={current}
      onChange={(id) => { if (id && id !== current) void switchOrg(id); }}
    />
  );
}

export function AgencySwitcher({ agencies, current }: { agencies: { id: string; name: string }[]; current: string }) {
  return (
    <Select
      aria-label="Agency"
      options={agencies.map((a) => ({ value: a.id, label: a.name }))}
      value={current}
      onChange={(id) => { if (id && id !== current) void switchAgency(id); }}
    />
  );
}
