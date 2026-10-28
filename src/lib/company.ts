// Reads and checks the company settings form. Plain functions, so tests can load them.

import { CITIES } from "./places.ts";

export const SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"] as const;
export const SIZE_LABEL: Record<string, string> = {
  "1-10": "1–10 people", "11-50": "11–50 people", "51-200": "51–200 people", "201-1000": "201–1,000 people", "1000+": "More than 1,000 people",
};

type FormLike = { get(name: string): unknown; getAll(name: string): unknown[] };

export type CompanyInput = {
  name: string; slug: string; website: string | null; about: string | null;
  size: string | null; industry: string | null; office_places: string[];
};
export type CompanyErrors = Partial<Record<keyof CompanyInput, string>>;

const text = (f: FormLike, k: string) => String(f.get(k) ?? "").trim();

export function readCompany(f: FormLike): { data?: CompanyInput; errors: CompanyErrors } {
  const errors: CompanyErrors = {};
  const name = text(f, "name");
  if (!name) errors.name = "Add your company name.";
  else if (name.length > 120) errors.name = "Keep the name under 120 characters.";

  const slug = text(f, "slug").toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) errors.slug = "Use lowercase letters, numbers and dashes, like example-co.";

  let website: string | null = text(f, "website") || null;
  if (website) {
    try {
      const u = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
      if (!/\./.test(u.hostname)) throw new Error();
      website = u.origin + (u.pathname === "/" ? "" : u.pathname);
    } catch {
      errors.website = "Enter your website, like example.com.";
    }
  }

  const about = text(f, "about");
  if (about.length > 2000) errors.about = "Keep this under 2,000 characters.";

  const size = text(f, "size") || null;
  if (size && !(SIZES as readonly string[]).includes(size)) errors.size = "Choose a size from the list.";

  const industry = text(f, "industry");
  if (industry.length > 80) errors.industry = "Keep this under 80 characters.";

  const cities = new Set(CITIES.map((c) => c.slug));
  const office_places = f.getAll("office_places").map(String).filter(Boolean);
  if (office_places.some((c) => !cities.has(c))) errors.office_places = "Choose cities from the list.";

  if (Object.keys(errors).length) return { errors };
  return { errors, data: { name, slug, website, about: about || null, size, industry: industry || null, office_places } };
}

// Logo files live at logos/<company id>/<file>. Only accept a path inside the company's own folder.
export const logoPathOk = (orgId: string, path: string) =>
  new RegExp(`^${orgId}/[0-9]+\\.(png|jpg|webp|svg)$`).test(path);
