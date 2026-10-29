// Reads and checks the job form. Completeness for review is checked by the database (job_missing in
// supabase/migrations/008_publishing.sql); this checks that each value is valid. Plain functions for tests.

import { CITIES, COUNTRIES } from "./places.ts";
import { CURRENCIES, ROLES } from "./taxonomy.ts";

type FormLike = { get(name: string): unknown; getAll(name: string): unknown[] };

export const SENIORITIES = ["intern", "entry", "mid", "senior", "lead", "director", "executive"] as const;
export const TYPES = ["full_time", "part_time", "contract", "temporary", "internship"] as const;
export const WORKPLACE_VALUES = ["on_site", "hybrid", "remote"] as const;

export type JobInput = {
  title: string;
  role: string | null;
  category: string | null;
  seniority: string | null;
  employment_type: string | null;
  workplace: string | null;
  office_places: string[];
  eligible_countries: string[];
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  description: string;
  apply_method: "ocelot" | "external";
  apply_url: string | null;
};
export type JobErrors = Partial<Record<keyof JobInput | "questions" | "salary", string>>;

const text = (f: FormLike, k: string) => String(f.get(k) ?? "").trim();
const pick = <T extends readonly string[]>(v: string, list: T) => ((list as readonly string[]).includes(v) ? v : null);
const money = (raw: string) => (raw === "" ? null : Number(raw.replace(/[,\s]/g, "")));

export function readJob(f: FormLike): { data?: JobInput; questions: string[]; errors: JobErrors } {
  const errors: JobErrors = {};

  const title = text(f, "title");
  if (!title) errors.title = "Add a job title.";
  else if (title.length > 140) errors.title = "Keep the title under 140 characters.";

  const roleSlug = text(f, "role");
  const role = ROLES.find((r) => r.slug === roleSlug) ?? null;
  if (roleSlug && !role) errors.role = "Choose a role from the list.";

  const seniority = pick(text(f, "seniority"), SENIORITIES);
  if (text(f, "seniority") && !seniority) errors.seniority = "Choose a seniority from the list.";
  const employment_type = pick(text(f, "employment_type"), TYPES);
  if (text(f, "employment_type") && !employment_type) errors.employment_type = "Choose a type from the list.";
  const workplace = pick(text(f, "workplace"), WORKPLACE_VALUES);
  if (text(f, "workplace") && !workplace) errors.workplace = "Choose on-site, hybrid or remote.";

  const cities = new Set(CITIES.map((c) => c.slug));
  // Remote jobs have no office city; anything picked before switching to remote is dropped.
  const office_places = workplace === "remote" ? [] : f.getAll("office_places").map(String).filter(Boolean);
  if (office_places.some((c) => !cities.has(c))) errors.office_places = "Choose cities from the list.";

  const codes = new Set(COUNTRIES.map((c) => c.country_code));
  const eligible_countries = f.getAll("eligible_countries").map(String).filter(Boolean);
  if (eligible_countries.some((c) => !codes.has(c))) errors.eligible_countries = "Choose countries from the list.";

  const salary_min = money(text(f, "salary_min"));
  const salary_max = money(text(f, "salary_max"));
  const salary_currency = text(f, "salary_currency") || null;
  const salary_period = text(f, "salary_period") || null;
  const hasPay = salary_min !== null || salary_max !== null;
  if ([salary_min, salary_max].some((n) => n !== null && (!Number.isFinite(n) || n < 0))) errors.salary = "Enter pay as numbers, like 1500.";
  else if (salary_min !== null && salary_max !== null && salary_min > salary_max) errors.salary = "The lowest pay can't be more than the highest.";
  else if (hasPay && !(salary_currency && (CURRENCIES as readonly string[]).includes(salary_currency))) errors.salary = "Choose the currency for the pay.";
  else if (hasPay && !["hour", "month", "year"].includes(salary_period ?? "")) errors.salary = "Choose per hour, month or year.";

  const description = text(f, "description");
  if (description.length > 10000) errors.description = "Keep the description under 10,000 characters.";

  const apply_method = text(f, "apply_method") === "external" ? "external" : "ocelot";
  let apply_url: string | null = null;
  if (apply_method === "external") {
    // Blank is fine for a draft; review asks for it.
    const raw = text(f, "apply_url");
    if (raw) {
      try {
        const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
        if (!/\./.test(u.hostname)) throw new Error();
        apply_url = u.toString();
      } catch {
        errors.apply_url = "Enter the web address where people apply.";
      }
    }
  }

  const questions = f.getAll("questions").map((q) => String(q).trim()).filter(Boolean);
  if (questions.length > 5) errors.questions = "Ask up to 5 questions.";
  else if (questions.some((q) => q.length < 3 || q.length > 300)) errors.questions = "Each question needs 3 to 300 characters.";

  if (Object.keys(errors).length) return { questions, errors };
  return {
    questions,
    errors,
    data: {
      title, role: role?.slug ?? null, category: role?.category ?? null, seniority, employment_type, workplace,
      office_places, eligible_countries,
      salary_min, salary_max, salary_currency: hasPay ? salary_currency : null, salary_period: hasPay ? salary_period : null,
      description, apply_method, apply_url,
    },
  };
}
