// Role and place pages for search engines: /sales-jobs, /sales-jobs-in-texas, /remote-marketing-jobs,
// /account-executive-jobs-in-new-york, /jobs-in-ontario. Each one is a Find jobs search with a clean address.
// A page may add one more filter (an "extra"): a level (/senior-sales-jobs), a job type (/contract-marketing-jobs,
// /marketing-internships), hybrid or on-site (/hybrid-sales-jobs-in-chicago), or pay (/sales-jobs-paying-100k).
// Plain functions, so tests and the filter bar can use them.

import { CITIES, COUNTRIES } from "./places.ts";
import { REGIONS } from "./regions.ts";
import { filtersQuery, readFilters, type Filters } from "./search.ts";
import { CATEGORIES, ROLES } from "./taxonomy.ts";

// Areas: the three categories, then each role, with the words people search for.
const ROLE_WORDS: Record<string, [string, string]> = {
  seo: ["seo", "SEO"], content: ["content-marketing", "Content marketing"], performance: ["performance-marketing", "Performance marketing"],
  social: ["social-media", "Social media"], brand: ["brand-communications", "Brand and communications"], product_marketing: ["product-marketing", "Product marketing"],
  growth: ["growth-marketing", "Growth marketing"], lifecycle: ["email-marketing", "Email and lifecycle marketing"], marketing_ops: ["marketing-operations", "Marketing operations"],
  marketing_lead: ["marketing-director", "Marketing leadership"], sdr: ["sales-development", "Sales development"], account_executive: ["account-executive", "Account executive"],
  account_manager: ["account-manager", "Account manager"], partnerships: ["partnerships", "Partnerships"], sales_ops: ["sales-operations", "Sales operations"],
  sales_lead: ["sales-director", "Sales leadership"], cs_manager: ["customer-success-manager", "Customer success manager"],
  onboarding: ["implementation", "Onboarding and implementation"], support: ["customer-support", "Customer support"],
  cs_ops: ["customer-success-operations", "Customer success operations"], cs_lead: ["customer-success-director", "Customer success leadership"],
};
type Area = { slug: string; label: string; category: string | null; role: string | null };
export const AREAS: Area[] = [
  ...CATEGORIES.filter((c) => c.slug !== "other").map((c) => ({ slug: c.slug.replace(/_/g, "-"), label: c.name, category: c.slug, role: null })),
  ...ROLES.filter((r) => ROLE_WORDS[r.slug]).map((r) => ({ slug: ROLE_WORDS[r.slug][0], label: ROLE_WORDS[r.slug][1], category: r.category, role: r.slug })),
];

// Places: the United States and Canada, their states and provinces, and their cities on Ocelot's list.
type Place = { slug: string; label: string; country: string | null; region: string | null; city: string | null };
const cityCodes = new Set(CITIES.filter((c) => c.country_code === "US" || c.country_code === "CA").map((c) => c.slug));
export const PLACES: Place[] = [
  ...COUNTRIES.filter((c) => c.country_code === "US" || c.country_code === "CA").map((c) => ({ slug: c.slug, label: c.country_code === "US" ? "the United States" : c.name, country: c.country_code, region: null, city: null })),
  ...REGIONS.map((r) => {
    const slug = r.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    // New York the state and New York the city: the state says so.
    return cityCodes.has(slug) ? { slug: `${slug}-state`, label: `${r.name} State`, country: null, region: r.code, city: null } : { slug, label: r.name, country: null, region: r.code, city: null };
  }),
  ...CITIES.filter((c) => cityCodes.has(c.slug)).map((c) => ({ slug: c.slug, label: c.name, country: null, region: null, city: c.slug })),
];
// The one extra filter a page may add. key is how the counts table names it (037_seo_more.sql).
export type Extra = { key: string; slug: string; label: string; set: Partial<Filters> };
export const EXTRAS: Extra[] = [
  { key: "level:entry", slug: "entry-level", label: "Entry level", set: { level: ["entry"] } },
  { key: "level:senior", slug: "senior", label: "Senior", set: { level: ["senior"] } },
  { key: "level:lead", slug: "lead", label: "Lead", set: { level: ["lead"] } },
  { key: "level:director", slug: "director", label: "Director", set: { level: ["director"] } },
  { key: "type:part_time", slug: "part-time", label: "Part-time", set: { type: ["part_time"] } },
  { key: "type:contract", slug: "contract", label: "Contract", set: { type: ["contract"] } },
  { key: "type:internship", slug: "internships", label: "Internships", set: { type: ["internship"] } },
  { key: "wp:hybrid", slug: "hybrid", label: "Hybrid", set: { where: ["hybrid"] } },
  { key: "wp:on_site", slug: "on-site", label: "On-site", set: { where: ["on_site"] } },
  { key: "pay:100000", slug: "paying-100k", label: "Paying $100k+", set: { minPay: 100_000 } },
  { key: "pay:150000", slug: "paying-150k", label: "Paying $150k+", set: { minPay: 150_000 } },
];
const PREFIX_EXTRAS = EXTRAS.filter((e) => e.key.startsWith("level:") || e.key === "type:part_time" || e.key === "type:contract" || e.key.startsWith("wp:"));

// The extra a search has: "" for none, or null when it has more than one (or one no page is made for).
export function extraOf(f: Filters): string | null {
  const found: string[] = [];
  if (f.level.length) found.push(f.level.length === 1 ? `level:${f.level[0]}` : "x");
  if (f.type.length) found.push(f.type.length === 1 ? `type:${f.type[0]}` : "x");
  if (f.where.length && !(f.where.length === 1 && f.where[0] === "remote")) found.push(f.where.length === 1 ? `wp:${f.where[0]}` : "x");
  if (f.minPay) found.push(`pay:${f.minPay}`);
  if (found.length > 1) return null;
  if (!found.length) return "";
  return EXTRAS.some((e) => e.key === found[0]) ? found[0] : null;
}
export const extraByKey = (key: string) => EXTRAS.find((e) => e.key === key) ?? null;

const AREA_BY_SLUG = new Map(AREAS.map((a) => [a.slug, a]));
const PLACE_BY_SLUG = new Map(PLACES.map((p) => [p.slug, p]));

const EMPTY = readFilters({});

// "/remote-sales-jobs-in-texas" -> the search it stands for, or null for an address that isn't one.
// Shape: [remote-][level, part-time, contract, hybrid or on-site-][area-]jobs|internships[-paying-100k][-in-place]
const PREFIXES = PREFIX_EXTRAS.map((e) => e.slug).join("|");
const PATTERN = new RegExp(`^(remote-)?(?:(${PREFIXES})-)?(?:([a-z-]+?)-)?(jobs|internships)(?:-(paying-100k|paying-150k))?(?:-in-([a-z-]+))?$`);

export function parseSeoPath(slug: string): Filters | null {
  const m = slug.match(PATTERN);
  if (!m) return null;
  const [, remote, prefix, areaSlug, noun, paying, placeSlug] = m;
  const extras = [prefix, noun === "internships" ? "internships" : undefined, paying].filter(Boolean) as string[];
  if (extras.length > 1) return null;
  const extra = extras.length ? EXTRAS.find((e) => e.slug === extras[0]) ?? null : null;
  if (extras.length && !extra) return null;
  const area = areaSlug ? AREA_BY_SLUG.get(areaSlug) : null;
  const place = placeSlug ? PLACE_BY_SLUG.get(placeSlug) : null;
  if ((areaSlug && !area) || (placeSlug && !place)) return null;
  const f: Filters = {
    ...EMPTY, where: remote ? ["remote"] : [],
    category: area?.category ?? null, role: area?.role ?? null,
    country: place?.country ?? null, region: place?.region ?? null, city: place?.city ?? null,
    ...(extra?.set ?? {}),
  };
  if (remote && extra?.key.startsWith("wp:")) return null;
  // One address per search: anything that doesn't write back to this same address isn't a page.
  return seoPath(f) === `/${slug}` ? f : null;
}

// The clean address for a search, when it is one of these pages: an area, a place, remote, or a mix of them, plus at
// most one extra, and nothing else. Remote pages don't take a city.
export function seoPath(f: Filters): string | null {
  if (f.q || f.pay || f.posted || f.sort !== "best") return null;
  const extraKey = extraOf(f);
  if (extraKey === null) return null;
  const extra = extraKey ? extraByKey(extraKey) : null;
  const remote = f.where.includes("remote");
  if (remote && f.where.length > 1) return null;
  const area = f.role ? AREAS.find((a) => a.role === f.role) : f.category ? AREAS.find((a) => !a.role && a.category === f.category) : null;
  if ((f.role || f.category) && !area) return null;
  const places = [f.country, f.region, f.city].filter(Boolean).length;
  if (places > 1) return null;
  const place = f.city ? PLACES.find((p) => p.city === f.city) : f.region ? PLACES.find((p) => p.region === f.region) : f.country ? PLACES.find((p) => p.country === f.country) : null;
  if (places && !place) return null;
  if (remote && f.city) return null;
  if (!remote && !area && !place && !extra) return null;
  // Leadership roles already say their level.
  if (extra?.key.startsWith("level:") && area?.role?.endsWith("_lead")) return null;
  const prefix = extra && PREFIX_EXTRAS.includes(extra) ? `${extra.slug}-` : "";
  const noun = extra?.key === "type:internship" ? "internships" : "jobs";
  const paying = extra?.key.startsWith("pay:") ? `-${extra.slug}` : "";
  return `/${remote ? "remote-" : ""}${prefix}${area ? `${area.slug}-` : ""}${noun}${paying}${place ? `-in-${place.slug}` : ""}`;
}

// Where a search lives: its clean page when it has one, else Find jobs with the filters in the address.
export function searchHref(f: Filters, page = 1): string {
  const clean = seoPath(f);
  if (clean) return page > 1 ? `${clean}?page=${page}` : clean;
  return `/jobs${filtersQuery(f, page)}`;
}

// "Sales jobs in Texas", "Remote marketing jobs", "Jobs in Ontario", "Senior account executive jobs in New York",
// "Marketing internships", "Sales jobs paying $100k+ in Texas".
export function seoHeading(f: Filters): string {
  const area = f.role ? AREAS.find((a) => a.role === f.role) : f.category ? AREAS.find((a) => !a.role && a.category === f.category) : null;
  const place = f.city ? PLACES.find((p) => p.city === f.city) : f.region ? PLACES.find((p) => p.region === f.region) : f.country ? PLACES.find((p) => p.country === f.country) : null;
  const remote = f.where.includes("remote");
  const key = extraOf(f);
  const extra = key ? extraByKey(key) : null;
  const lower = (t: string) => t.replace(/^(?!SEO)\w/, (c) => c.toLowerCase());
  const before = extra && PREFIX_EXTRAS.includes(extra) ? lower(extra.label) : "";
  const noun = extra?.key === "type:internship" ? "internships" : "jobs";
  const paying = extra?.key.startsWith("pay:") ? `paying $${extra.key.slice(4, -3)}k+` : "";
  const what = [remote ? "remote" : "", before, area ? lower(area.label) : "", noun, paying].filter(Boolean).join(" ");
  const text = place ? `${what} in ${place.label}` : what;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
