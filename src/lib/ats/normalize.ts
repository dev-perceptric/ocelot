// Turns a job from a company's board into an Ocelot job, or says why it's left out.
// Plain functions with no app imports beyond the lists, so tests can load them.

import { CITIES, COUNTRIES } from "../places.ts";
import { slugify } from "../jobs.ts";
import type { RawJob } from "./boards.ts";

// ---------- Text ----------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", bull: "•" };
export const decodeEntities = (t: string) =>
  t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

// HTML to plain text with paragraphs and bullet points kept. Greenhouse sends its HTML escaped, so a second
// decode happens when the text still holds tags after the first.
export function htmlToText(html: string): string {
  let h = html;
  if (!/<[a-z]/i.test(h) && /&lt;[a-z]/i.test(h)) h = decodeEntities(h);
  const text = h
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|ul|ol|tr|section)>/gi, "\n")
    .replace(/<(p|div|h[1-6]|ul|ol|tr|section)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------- Places ----------

const COUNTRY_ALIASES: Record<string, string> = {
  "viet nam": "VN", "usa": "US", "u.s.": "US", "u.s": "US", "us": "US", "united states of america": "US", "uk": "GB", "england": "GB",
  "great britain": "GB", "uae": "AE", "korea": "KR", "republic of korea": "KR", "hong kong sar": "HK",
  // States and provinces people write out in full (Georgia and Washington are left out: a country and a city).
  "california": "US", "texas": "US", "florida": "US", "illinois": "US", "massachusetts": "US", "colorado": "US", "arizona": "US",
  "oregon": "US", "utah": "US", "virginia": "US", "north carolina": "US", "pennsylvania": "US", "ohio": "US", "michigan": "US",
  "minnesota": "US", "tennessee": "US", "new jersey": "US", "maryland": "US",
  "ontario": "CA", "british columbia": "CA", "quebec": "CA", "québec": "CA", "alberta": "CA", "manitoba": "CA", "nova scotia": "CA",
};
const CITY_ALIASES: Record<string, string> = {
  "ho chi minh": "ho-chi-minh-city", "hcmc": "ho-chi-minh-city", "saigon": "ho-chi-minh-city", "ha noi": "hanoi", "bangalore": "bengaluru",
  "nyc": "new-york", "new york city": "new-york", "sf": "san-francisco", "bay area": "san-francisco", "sf bay area": "san-francisco",
  "washington dc": "washington-dc", "washington d.c.": "washington-dc", "dc": "washington-dc", "montréal": "montreal", "kitchener-waterloo": "waterloo",
};
// "Austin, TX" or "Toronto, ON": a state or province code after a comma.
const US_STATE = /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/;
const CA_PROVINCE = /,\s*(ON|BC|QC|AB|MB|SK|NS|NB|NL|PE|YT|NT|NU)\b/;

// Remote across a region: which countries it covers ("*" for anywhere).
const REGIONS: [RegExp, string[] | "*"][] = [
  [/\b(worldwide|anywhere|global)\b/i, "*"],
  [/\b(north america|americas|us\s*(and|&|\/|or)\s*canada|canada\s*(and|&|\/|or)\s*us)\b/i, ["US", "CA"]],
  [/\b(apac|asia[- ]?pacific|asia|south[- ]?east asia|southeast asia)\b/i, ["VN", "SG", "TH", "MY", "ID", "PH", "KH", "LA", "MM", "BN", "HK", "TW", "JP", "KR", "IN", "AU", "NZ"]],
  [/\b(emea|europe)\b/i, ["GB", "IE", "DE", "NL", "FR", "AE"]],
];

const clean = (t: string) => t.toLowerCase().replace(/[^a-z0-9.\u00c0-\u024f\s-]/g, " ").replace(/\s+/g, " ").trim();
const words = (t: string) => ` ${clean(t)} `;
const has = (hay: string, needle: string) => hay.includes(` ${clean(needle)} `);

export function readPlaces(raw: Pick<RawJob, "places" | "countries" | "remote" | "hybrid">) {
  const text = words(raw.places.join(" , "));
  const countries = new Set<string>();
  const cities = new Set<string>();
  for (const c of raw.countries) {
    const code = c.trim().toUpperCase();
    if (COUNTRIES.some((k) => k.country_code === code)) countries.add(code);
    else {
      const byName = COUNTRIES.find((k) => k.name.toLowerCase() === c.trim().toLowerCase())?.country_code ?? COUNTRY_ALIASES[c.trim().toLowerCase()];
      if (byName) countries.add(byName);
    }
  }
  for (const k of COUNTRIES) if (has(text, k.name)) countries.add(k.country_code);
  for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) if (has(text, alias)) countries.add(code);
  for (const c of CITIES) if (has(text, c.name)) { cities.add(c.slug); countries.add(c.country_code); }
  for (const [alias, slug] of Object.entries(CITY_ALIASES)) if (has(text, alias)) {
    cities.add(slug);
    const code = CITIES.find((c) => c.slug === slug)?.country_code;
    if (code) countries.add(code);
  }
  for (const p of raw.places) {
    if (US_STATE.test(p)) countries.add("US");
    if (CA_PROVINCE.test(p)) countries.add("CA");
  }
  const placeText = raw.places.join(" ");
  const remote = raw.remote ?? /\bremote\b/i.test(placeText);
  const hybrid = !remote && (raw.hybrid ?? /\bhybrid\b/i.test(placeText));
  let region: string[] | "*" | null = null;
  for (const [re, codes] of REGIONS) if (re.test(placeText)) { region = codes === "*" || region === "*" ? "*" : [...new Set([...(region ?? []), ...codes])]; }
  return { countries: [...countries], cities: [...cities], remote, hybrid, region };
}

// ---------- Roles and levels ----------

// Jobs outside marketing, sales and customer success, even when the title has one of our words in it.
const NOT_OUR_ROLES = new RegExp([
  "engineer", "engineering", "developer", "scientist", "designer", "architect", "software", "devops", "security", "machine learning", "data analyst",
  "counsel", "lawyer", "legal", "accountant", "accounting", "finance", "tax", "treasury", "audit", "risk", "compliance", "aml", "kyc", "cdd", "fraud",
  "recruiter", "recruiting", "sourcer", "talent", "people", "hr", "human resources", "payroll", "employer brand", "employee experience",
  "product manager", "product owner", "project manager", "executive assistant", "assistant to",
  "it support", "it operations", "av support", "desktop support", "help ?desk analyst",
  // Shop floor and seasonal work, not office careers.
  "retail sales", "store", "seasonal", "cashier", "warehouse", "driver", "barista",
].map((w) => `\\b${w}\\b`).join("|"), "i");
const ROLE_RULES: [RegExp, string, "marketing" | "sales" | "customer_success"][] = [
  [/\b(head|director|vp|vice president|chief)\b.*\bmarketing\b|\bcmo\b/i, "marketing_lead", "marketing"],
  [/\b(head|director|vp|vice president|chief)\b.*\b(sales|revenue)\b|\bcro\b/i, "sales_lead", "sales"],
  [/\b(head|director|vp|vice president|chief)\b.*\b(customer|support|success)\b/i, "cs_lead", "customer_success"],
  [/\bmarketing (operations|ops)\b|\bmartech\b|\bmarketing automation\b/i, "marketing_ops", "marketing"],
  [/\b(sales|revenue) (operations|ops)\b|\brevops\b|\bsales enablement\b/i, "sales_ops", "sales"],
  [/\b(customer success|support|cs) (operations|ops)\b/i, "cs_ops", "customer_success"],
  [/\bproduct marketing\b|\bpmm\b/i, "product_marketing", "marketing"],
  [/\bseo\b|\bsearch engine\b/i, "seo", "marketing"],
  [/\bperformance market|\bpaid (media|social|search|acquisition)\b|\bppc\b|\bsem\b|\bmedia buy/i, "performance", "marketing"],
  [/\bsocial media\b|\bcommunity manager\b/i, "social", "marketing"],
  [/\blifecycle\b|\bcrm market|\bemail market|\bretention market/i, "lifecycle", "marketing"],
  [/\bcontent\b|\bcopywrit|\bwriter\b|\beditor\b/i, "content", "marketing"],
  [/\bbrand\b|\bcommunications\b|\bpublic relations\b|\bpr manager\b/i, "brand", "marketing"],
  [/\bsdr\b|\bbdr\b|\bsales development\b|\bbusiness development rep/i, "sdr", "sales"],
  [/\baccount executive\b|\bae\b/i, "account_executive", "sales"],
  [/\baccount manag/i, "account_manager", "sales"],
  [/\bpartnership|\balliances\b|\bchannel (sales|partner|manager)/i, "partnerships", "sales"],
  [/\bcustomer success manager\b|\bcsm\b/i, "cs_manager", "customer_success"],
  [/\bonboarding\b|\bimplementation\b/i, "onboarding", "customer_success"],
  [/\bsupport\b|\bcustomer service\b|\bcustomer care\b|\bhelp ?desk\b/i, "support", "customer_success"],
  [/\bgrowth\b/i, "growth", "marketing"],
];
const CATEGORY_RULES: [RegExp, "marketing" | "sales" | "customer_success"][] = [
  [/\bmarketing\b|\bmarketer\b/i, "marketing"],
  [/\bsales\b|\bbusiness development\b|\bsales manager\b/i, "sales"],
  [/\bcustomer (success|experience)\b|\bclient success\b/i, "customer_success"],
];

export function guessRole(title: string): { role: string | null; category: "marketing" | "sales" | "customer_success" | null } {
  if (NOT_OUR_ROLES.test(title)) return { role: null, category: null };
  for (const [re, role, category] of ROLE_RULES) if (re.test(title)) return { role, category };
  for (const [re, category] of CATEGORY_RULES) if (re.test(title)) return { role: null, category };
  return { role: null, category: null };
}

export function guessSeniority(title: string, experience: string | null): string {
  const t = title.toLowerCase();
  if (/\bintern(ship)?\b/.test(t)) return "intern";
  if (/\b(chief|vp|vice president|cmo|cro)\b/.test(t)) return "executive";
  if (/\b(head|director)\b/.test(t)) return "director";
  if (/\b(lead|principal|staff)\b(?!\s*gen)/.test(t)) return "lead";
  if (/\b(senior|sr\.?)\b/.test(t)) return "senior";
  if (/\b(junior|jr\.?|associate|graduate|entry)\b/.test(t)) return "entry";
  const e = (experience ?? "").toLowerCase();
  if (/intern|student/.test(e)) return "intern";
  if (/entry|junior|associate/.test(e)) return "entry";
  if (/director/.test(e)) return "director";
  if (/executive/.test(e)) return "executive";
  if (/senior|experienced/.test(e)) return "senior";
  return "mid";
}

export function mapEmployment(v: string | null, title: string): string | null {
  const t = `${v ?? ""}`.toLowerCase().replace(/[\s_-]/g, "");
  if (/intern/.test(t) || /\bintern(ship)?\b/i.test(title)) return "internship";
  if (/parttime/.test(t)) return "part_time";
  if (/temp/.test(t)) return "temporary";
  if (/contract|freelance/.test(t)) return "contract";
  if (/fulltime|permanent/.test(t)) return "full_time";
  return null;
}

// ---------- The job ----------

export type SourceRules = { countries: string[]; niche_only: boolean };
export type JobFields = {
  external_id: string; title: string; description: string; apply_url: string; source_url: string;
  workplace: "remote" | "hybrid" | "on_site"; office_places: string[]; eligible_countries: string[];
  role: string | null; category: string | null; seniority: string; employment_type: string | null;
  salary_min: number | null; salary_max: number | null; salary_currency: string | null; salary_period: string | null;
};

export function toJob(raw: RawJob, rules: SourceRules): { job: JobFields } | { skip: "role" | "place" } {
  const { role, category } = guessRole(raw.title);
  if (rules.niche_only && !category) return { skip: "role" };
  const p = readPlaces(raw);
  const wanted = new Set(rules.countries);
  const inWanted = p.countries.filter((c) => wanted.has(c));
  let eligible: string[];
  const regional = p.region === "*" ? rules.countries : (p.region ?? []).filter((c) => wanted.has(c));
  if (inWanted.length) eligible = inWanted;
  else if (p.remote && !p.countries.length && regional.length) eligible = regional;
  else return { skip: "place" };
  const text = raw.text ?? (raw.html ? htmlToText(raw.html) : "");
  const sal = raw.salary;
  const currency = sal?.currency && /^[A-Z]{3}$/.test(sal.currency.toUpperCase()) ? sal.currency.toUpperCase() : null;
  const hasPay = Boolean(currency && sal?.period && (sal.min !== null || sal.max !== null));
  return {
    job: {
      external_id: raw.externalId, title: raw.title.slice(0, 140), description: text.slice(0, 10000),
      apply_url: raw.applyUrl, source_url: raw.postingUrl || raw.applyUrl,
      workplace: p.remote ? "remote" : p.hybrid ? "hybrid" : "on_site",
      office_places: p.remote ? [] : p.cities.filter((c) => wanted.has(CITIES.find((x) => x.slug === c)?.country_code ?? "")),
      eligible_countries: eligible,
      role, category: category ?? "other",
      seniority: guessSeniority(raw.title, raw.experience), employment_type: mapEmployment(raw.employment, raw.title),
      salary_min: hasPay ? sal!.min : null, salary_max: hasPay ? sal!.max : null,
      salary_currency: hasPay ? currency : null, salary_period: hasPay ? sal!.period : null,
    },
  };
}

// A stable address for an imported job: title, company, and a short tag from the board and job id.
export function importedSlug(title: string, company: string, key: string): string {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const part = (t: string, n: number, d: string) => (slugify(t).slice(0, n).replace(/-+$/, "") || d);
  return `${part(title, 60, "job")}-${part(company, 30, "company")}-${h.toString(36)}`;
}
