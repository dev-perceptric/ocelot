// Reads an application's snapshot (what the candidate sent) into plain fields for the company's screens.
// Older or deleted snapshots miss fields, so everything is optional and checked.

import { countryName } from "./places.ts";
import { LANGUAGES, PERIODS } from "./taxonomy.ts";

export type Snapshot = {
  deleted: boolean;
  name: string;
  email: string | null;
  phone: string | null;
  headline: string | null;
  place: string | null;
  experience: string | null;
  languages: string[];
  links: { label: string; url: string }[];
  salary: string | null;
  answers: { prompt: string; answer: string }[];
  note: string | null;
  jobTitle: string | null;
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const safeUrl = (v: unknown) => {
  const s = str(v);
  if (!s) return null;
  try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null; } catch { return null; }
};

export function readSnapshot(raw: unknown): Snapshot {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const deleted = s.deleted === true;
  const years = typeof s.years_experience === "number" ? s.years_experience : null;
  const lang = Array.isArray(s.languages) ? s.languages.filter((x): x is string => typeof x === "string") : [];
  const links = (Array.isArray(s.links) ? s.links : []).flatMap((l) => {
    const url = safeUrl((l as Record<string, unknown>)?.url);
    return url ? [{ label: (l as Record<string, unknown>).kind === "linkedin" ? "LinkedIn" : "Website", url }] : [];
  });
  const hope = s.salary_hope as Record<string, unknown> | null | undefined;
  const salary = hope && typeof hope.min === "number"
    ? `From ${str(hope.currency) ?? ""} ${hope.min.toLocaleString("en-US")} ${PERIODS.find((p) => p.value === hope.period)?.label ?? ""}`.replace(/\s+/g, " ").trim()
    : null;
  const answers = (Array.isArray(s.answers) ? s.answers : []).flatMap((a) => {
    const r = a as Record<string, unknown>;
    return typeof r?.prompt === "string" ? [{ prompt: r.prompt, answer: typeof r.answer === "string" ? r.answer : "" }] : [];
  });
  const city = str(s.city);
  const country = str(s.country_code);
  return {
    deleted,
    name: deleted ? "Deleted account" : str(s.name) ?? "Candidate",
    email: str(s.email),
    phone: str(s.phone),
    headline: str(s.headline),
    place: [city, country ? countryName(country) : null].filter(Boolean).join(", ") || null,
    experience: years === null ? null : years === 1 ? "1 year of experience" : `${years} years of experience`,
    languages: lang.map((c) => LANGUAGES.find((l) => l.code === c)?.name ?? c),
    links,
    salary,
    answers,
    note: str(s.note),
    jobTitle: str(s.job_title),
  };
}
