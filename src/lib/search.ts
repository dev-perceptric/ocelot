// Job search filters: read from the address (?q=&where=remote&country=VN...), checked against the fixed
// lists, and written back for links. Plain functions, so tests can load them.

import { CITIES, COUNTRIES } from "./places.ts";
import { CATEGORIES, ROLES } from "./taxonomy.ts";

export type Filters = {
  q: string;
  where: string[]; // workplaces
  country: string | null;
  city: string | null;
  category: string | null;
  role: string | null;
  level: string[]; // seniorities
  type: string[]; // employment types
  pay: boolean;
};

const WORKPLACES = ["remote", "hybrid", "on_site"];
const LEVELS = ["intern", "entry", "mid", "senior", "lead", "director", "executive"];
const TYPES = ["full_time", "part_time", "contract", "temporary", "internship"];

type Params = Record<string, string | string[] | undefined>;
const all = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? v.split(",") : []).map((s) => s.trim()).filter(Boolean);
const one = (v: string | string[] | undefined) => all(v)[0] ?? null;

export function readFilters(p: Params): Filters {
  const role = one(p.role);
  const roleRow = ROLES.find((r) => r.slug === role) ?? null;
  const category = one(p.category);
  return {
    // Search text keeps its commas; only list filters are comma-separated.
    q: String((Array.isArray(p.q) ? p.q[0] : p.q) ?? "").trim().slice(0, 100),
    where: all(p.where).filter((w) => WORKPLACES.includes(w)),
    country: COUNTRIES.some((c) => c.country_code === one(p.country)) ? one(p.country) : null,
    city: CITIES.some((c) => c.slug === one(p.city)) ? one(p.city) : null,
    // A role implies its category, so the two never disagree.
    category: roleRow?.category ?? (CATEGORIES.some((c) => c.slug === category) ? category : null),
    role: roleRow?.slug ?? null,
    level: all(p.level).filter((l) => LEVELS.includes(l)),
    type: all(p.type).filter((t) => TYPES.includes(t)),
    pay: one(p.pay) === "1",
  };
}

export function filtersQuery(f: Filters, page = 1): string {
  const s = new URLSearchParams();
  if (f.q) s.set("q", f.q);
  if (f.where.length) s.set("where", f.where.join(","));
  if (f.country) s.set("country", f.country);
  if (f.city) s.set("city", f.city);
  if (f.role) s.set("role", f.role);
  else if (f.category) s.set("category", f.category);
  if (f.level.length) s.set("level", f.level.join(","));
  if (f.type.length) s.set("type", f.type.join(","));
  if (f.pay) s.set("pay", "1");
  if (page > 1) s.set("page", String(page));
  const out = s.toString();
  return out ? `?${out}` : "";
}

export const activeCount = (f: Filters) =>
  f.where.length + (f.country ? 1 : 0) + (f.city ? 1 : 0) + (f.role || f.category ? 1 : 0) + f.level.length + f.type.length + (f.pay ? 1 : 0);
