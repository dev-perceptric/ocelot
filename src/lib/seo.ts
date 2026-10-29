// Role and place pages for search engines: /sales-jobs, /sales-jobs-in-texas, /remote-marketing-jobs,
// /account-executive-jobs-in-new-york, /jobs-in-ontario. Each one is a Find jobs search with a clean address.
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
const AREA_BY_SLUG = new Map(AREAS.map((a) => [a.slug, a]));
const PLACE_BY_SLUG = new Map(PLACES.map((p) => [p.slug, p]));

const EMPTY = readFilters({});

// "/remote-sales-jobs-in-texas" -> the search it stands for, or null for an address that isn't one.
export function parseSeoPath(slug: string): Filters | null {
  const m = slug.match(/^(remote-)?(?:([a-z-]+?)-)?jobs(?:-in-([a-z-]+))?$/);
  if (!m) return null;
  const [, remote, areaSlug, placeSlug] = m;
  const area = areaSlug ? AREA_BY_SLUG.get(areaSlug) : null;
  const place = placeSlug ? PLACE_BY_SLUG.get(placeSlug) : null;
  if ((areaSlug && !area) || (placeSlug && !place) || (!remote && !area && !place)) return null;
  return {
    ...EMPTY, where: remote ? ["remote"] : [],
    category: area?.category ?? null, role: area?.role ?? null,
    country: place?.country ?? null, region: place?.region ?? null, city: place?.city ?? null,
  };
}

// The clean address for a search, when it is one of these pages: an area, a place, remote, or a mix of them, and
// nothing else. Remote pages don't take a city.
export function seoPath(f: Filters): string | null {
  if (f.q || f.level.length || f.type.length || f.pay || f.posted || f.minPay || f.sort !== "best") return null;
  const remote = f.where.length === 1 && f.where[0] === "remote";
  if (f.where.length && !remote) return null;
  const area = f.role ? AREAS.find((a) => a.role === f.role) : f.category ? AREAS.find((a) => !a.role && a.category === f.category) : null;
  if ((f.role || f.category) && !area) return null;
  const places = [f.country, f.region, f.city].filter(Boolean).length;
  if (places > 1) return null;
  const place = f.city ? PLACES.find((p) => p.city === f.city) : f.region ? PLACES.find((p) => p.region === f.region) : f.country ? PLACES.find((p) => p.country === f.country) : null;
  if (places && !place) return null;
  if (remote && f.city) return null;
  if (!remote && !area && !place) return null;
  return `/${remote ? "remote-" : ""}${area ? `${area.slug}-` : ""}jobs${place ? `-in-${place.slug}` : ""}`;
}

// Where a search lives: its clean page when it has one, else Find jobs with the filters in the address.
export function searchHref(f: Filters, page = 1): string {
  const clean = seoPath(f);
  if (clean) return page > 1 ? `${clean}?page=${page}` : clean;
  return `/jobs${filtersQuery(f, page)}`;
}

// "Sales jobs in Texas", "Remote marketing jobs", "Jobs in Ontario".
export function seoHeading(f: Filters): string {
  const area = f.role ? AREAS.find((a) => a.role === f.role) : f.category ? AREAS.find((a) => !a.role && a.category === f.category) : null;
  const place = f.city ? PLACES.find((p) => p.city === f.city) : f.region ? PLACES.find((p) => p.region === f.region) : f.country ? PLACES.find((p) => p.country === f.country) : null;
  const remote = f.where.length === 1 && f.where[0] === "remote";
  const what = [remote ? "remote" : "", area ? area.label.replace(/^(?!SEO)\w/, (c) => c.toLowerCase()) : "", "jobs"].filter(Boolean).join(" ");
  const text = place ? `${what} in ${place.label}` : what;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
