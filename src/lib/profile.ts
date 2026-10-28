// Reads and checks the profile form. Plain functions with no imports beyond the lists, so tests can load them.

import { CITIES, COUNTRIES } from "./places.ts";
import { CURRENCIES, LANGUAGES, PERIODS, WORKPLACES } from "./taxonomy.ts";

export type FormLike = { get(name: string): unknown; getAll(name: string): unknown[] };

export type ProfileInput = {
  full_name: string;
  headline: string | null;
  phone: string | null;
  city: string | null;
  country_code: string | null;
  years_experience: number | null;
  work_countries: string[];
  languages: string[];
  open_to: string[];
  salary_hope_min: number | null;
  salary_hope_currency: string | null;
  salary_hope_period: string | null;
  links: { kind: "linkedin" | "website"; url: string }[];
  time_zone: string;
};

export type ProfileErrors = Partial<Record<keyof ProfileInput | "linkedin" | "website", string>>;

const text = (f: FormLike, k: string) => String(f.get(k) ?? "").trim();
const list = (f: FormLike, k: string) => f.getAll(k).map(String).filter(Boolean);

export function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function url(raw: string): URL | null {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

export function readProfile(f: FormLike): { data?: ProfileInput; errors: ProfileErrors } {
  const errors: ProfileErrors = {};

  const full_name = text(f, "full_name");
  if (!full_name) errors.full_name = "Add your name.";
  else if (full_name.length > 120) errors.full_name = "Keep your name under 120 characters.";

  const headline = text(f, "headline");
  if (headline.length > 140) errors.headline = "Keep your headline under 140 characters.";

  const phone = text(f, "phone");
  if (phone && !/^\+?[0-9 ()-]{6,20}$/.test(phone)) errors.phone = "Enter a phone number with digits only, like +84 90 123 4567.";

  const city = text(f, "city");
  const cityRow = CITIES.find((c) => c.slug === city);
  if (city && !cityRow) errors.city = "Choose a city from the list.";

  const yearsRaw = text(f, "years_experience");
  const years = yearsRaw === "" ? null : Number(yearsRaw);
  if (years !== null && (!Number.isInteger(years) || years < 0 || years > 60)) errors.years_experience = "Enter whole years from 0 to 60.";

  const codes = new Set(COUNTRIES.map((c) => c.country_code));
  const work_countries = list(f, "work_countries");
  if (work_countries.some((c) => !codes.has(c))) errors.work_countries = "Choose countries from the list.";

  const langs = new Set(LANGUAGES.map((l) => l.code));
  const languages = list(f, "languages");
  if (languages.some((l) => !langs.has(l))) errors.languages = "Choose languages from the list.";

  const places = new Set<string>(WORKPLACES.map((w) => w.value));
  const open_to = list(f, "open_to");
  if (open_to.some((o) => !places.has(o))) errors.open_to = "Choose on-site, hybrid or remote.";

  const amountRaw = text(f, "salary_hope_min").replace(/[,\s]/g, "");
  const amount = amountRaw === "" ? null : Number(amountRaw);
  const currency = text(f, "salary_hope_currency") || null;
  const period = text(f, "salary_hope_period") || null;
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) errors.salary_hope_min = "Enter an amount, like 2000.";
  else if (amount !== null && (!currency || !(CURRENCIES as readonly string[]).includes(currency))) errors.salary_hope_currency = "Choose a currency.";
  else if (amount !== null && (!period || !PERIODS.some((p) => p.value === period))) errors.salary_hope_period = "Choose per hour, month or year.";

  const links: ProfileInput["links"] = [];
  const linkedinRaw = text(f, "linkedin");
  if (linkedinRaw) {
    const u = url(linkedinRaw);
    if (!u || !/(^|\.)linkedin\.com$/i.test(u.hostname)) errors.linkedin = "Enter your LinkedIn address, like linkedin.com/in/your-name.";
    else links.push({ kind: "linkedin", url: u.toString() });
  }
  const websiteRaw = text(f, "website");
  if (websiteRaw) {
    const u = url(websiteRaw);
    if (!u) errors.website = "Enter a web address, like yourname.com.";
    else links.push({ kind: "website", url: u.toString() });
  }

  const time_zone = text(f, "time_zone") || "Asia/Ho_Chi_Minh";
  if (!validTimeZone(time_zone)) errors.time_zone = "Choose a time zone from the list.";

  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    data: {
      full_name,
      headline: headline || null,
      phone: phone || null,
      city: cityRow?.slug ?? null,
      country_code: cityRow?.country_code ?? null,
      years_experience: years,
      work_countries,
      languages,
      open_to,
      salary_hope_min: amount,
      salary_hope_currency: amount === null ? null : currency,
      salary_hope_period: amount === null ? null : period,
      links,
      time_zone,
    },
  };
}
