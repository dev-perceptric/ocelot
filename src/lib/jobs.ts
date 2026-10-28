// Job fields, labels and the Google JobPosting data. No imports, so tests can load it directly.

export type Job = {
  id: string;
  org_id: string;
  slug: string;
  title: string;
  description: string;
  category: string | null;
  seniority: string | null;
  employment_type: string | null;
  workplace: "on_site" | "hybrid" | "remote" | null;
  office_locations: string[];
  eligible_countries: string[];
  time_zones: string[];
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: "hour" | "month" | "year" | null;
  apply_method: "ocelot" | "external";
  apply_url: string | null;
  status: string;
  featured_until: string | null;
  published_at: string | null;
  expires_at: string | null;
};

export type Org = {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  logo_url: string | null;
  about: string | null;
  locations: string[];
  email_verified_domain: string | null;
  business_verified_at: string | null;
};

export const WORKPLACE: Record<string, string> = { on_site: "On-site", hybrid: "Hybrid", remote: "Remote" };
export const EMPLOYMENT: Record<string, string> = {
  full_time: "Full-time", part_time: "Part-time", contract: "Contract", temporary: "Temporary", internship: "Internship",
};
export const SENIORITY: Record<string, string> = {
  intern: "Intern", entry: "Entry level", mid: "Mid level", senior: "Senior", lead: "Lead", director: "Director", executive: "Executive",
};
export const CATEGORY: Record<string, string> = {
  marketing: "Marketing", sales: "Sales", customer_success: "Customer success", other: "Other",
};

const COUNTRY_NAMES: Record<string, string> = {
  VN: "Vietnam", SG: "Singapore", TH: "Thailand", MY: "Malaysia", ID: "Indonesia", PH: "Philippines",
  KH: "Cambodia", LA: "Laos", MM: "Myanmar", BN: "Brunei", US: "United States", GB: "United Kingdom", AU: "Australia",
};
export const countryName = (code: string) => COUNTRY_NAMES[code] ?? code;

const PERIOD: Record<string, string> = { hour: "hour", month: "month", year: "year" };

// "USD 2,000-3,000 / month". Empty when the company didn't share pay.
export function formatSalary(job: Pick<Job, "salary_min" | "salary_max" | "salary_currency" | "salary_period">): string {
  const { salary_min: min, salary_max: max, salary_currency: cur, salary_period: per } = job;
  if (min == null && max == null) return "";
  const n = (v: number) => v.toLocaleString("en-US");
  const range = min != null && max != null && min !== max ? `${n(min)}-${n(max)}` : n((min ?? max)!);
  const prefix = min == null ? "Up to " : max == null ? "From " : "";
  return `${prefix}${cur ? `${cur} ` : ""}${range}${per ? ` / ${PERIOD[per]}` : ""}`;
}

// "Remote (Vietnam, Singapore)" or "Hybrid, Ho Chi Minh City".
export function formatWhere(job: Pick<Job, "workplace" | "office_locations" | "eligible_countries">): string {
  const kind = job.workplace ? WORKPLACE[job.workplace] : "";
  if (job.workplace === "remote") {
    const where = job.eligible_countries.map(countryName).join(", ");
    return where ? `${kind} (${where})` : kind;
  }
  return [kind, job.office_locations.join(" / ")].filter(Boolean).join(", ");
}

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

const GOOGLE_EMPLOYMENT: Record<string, string> = {
  full_time: "FULL_TIME", part_time: "PART_TIME", contract: "CONTRACTOR", temporary: "TEMPORARY", internship: "INTERN",
};
const GOOGLE_UNIT: Record<string, string> = { hour: "HOUR", month: "MONTH", year: "YEAR" };

// Google's JobPosting structured data. It must match what the page shows, so it is built from the same row.
export function jobPostingJsonLd(job: Job, org: Org, siteUrl: string): Record<string, unknown> {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    datePosted: job.published_at,
    hiringOrganization: {
      "@type": "Organization",
      name: org.name,
      ...(org.website ? { sameAs: org.website } : {}),
      ...(org.logo_url ? { logo: org.logo_url } : {}),
    },
    identifier: { "@type": "PropertyValue", name: org.name, value: job.id },
    url: `${siteUrl}/jobs/${job.slug}`,
    directApply: job.apply_method === "ocelot",
  };
  if (job.expires_at) data.validThrough = job.expires_at;
  if (job.employment_type) data.employmentType = GOOGLE_EMPLOYMENT[job.employment_type];
  if (job.workplace === "remote") {
    data.jobLocationType = "TELECOMMUTE";
    data.applicantLocationRequirements = job.eligible_countries.map((c) => ({ "@type": "Country", name: countryName(c) }));
  } else if (job.office_locations.length) {
    data.jobLocation = job.office_locations.map((l) => ({
      "@type": "Place",
      address: { "@type": "PostalAddress", addressLocality: l },
    }));
  }
  if (job.salary_currency && (job.salary_min != null || job.salary_max != null)) {
    data.baseSalary = {
      "@type": "MonetaryAmount",
      currency: job.salary_currency,
      value: {
        "@type": "QuantitativeValue",
        ...(job.salary_min != null ? { minValue: job.salary_min } : {}),
        ...(job.salary_max != null ? { maxValue: job.salary_max } : {}),
        ...(job.salary_period ? { unitText: GOOGLE_UNIT[job.salary_period] } : {}),
      },
    };
  }
  return data;
}

// "Today", "3 days ago", "2 weeks ago".
export function postedAgo(iso: string | null, now = new Date()): string {
  if (!iso) return "";
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}
