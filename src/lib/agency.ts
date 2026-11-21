// Reads and checks the agency profile form. Plain functions, so tests can load them.

type FormLike = { get(name: string): unknown };

export type AgencyInput = { name: string; slug: string; website: string | null; about: string | null };
export type AgencyErrors = Partial<Record<keyof AgencyInput, string>>;
export type AgencyRole = "owner" | "admin" | "recruiter";

export const AGENCY_ROLE_NAME: Record<AgencyRole, string> = { owner: "Owner", admin: "Admin", recruiter: "Recruiter" };

const text = (f: FormLike, k: string) => String(f.get(k) ?? "").trim();

export function readAgency(f: FormLike): { data?: AgencyInput; errors: AgencyErrors } {
  const errors: AgencyErrors = {};
  const name = text(f, "name");
  if (!name) errors.name = "Add your agency's name.";
  else if (name.length > 120) errors.name = "Keep the name under 120 characters.";

  const slug = text(f, "slug").toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) errors.slug = "Use lowercase letters, numbers and dashes, like example-agency.";

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

  if (Object.keys(errors).length) return { errors };
  return { errors, data: { name, slug, website, about: about || null } };
}

// Agency logos live at logos/agencies/<agency id>/<file>. Only accept a path inside the agency's own folder.
export const agencyLogoPathOk = (agencyId: string, path: string) =>
  new RegExp(`^agencies/${agencyId}/[0-9]+\\.(png|jpg|webp|svg)$`).test(path);

// A company page address someone pasted ("joinocelot.com/companies/acme", "/companies/acme/", "acme") as its slug.
export function companySlugFrom(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  const slug = s.includes("/") ? s.slice(s.lastIndexOf("/") + 1) : s;
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? slug : null;
}
