// Job categories, roles and currencies. Mirrors the roles table and the currency checks in
// supabase/migrations/003_lists_and_profiles.sql; tests/lists.test.ts fails if they drift apart.

export const CATEGORIES = [
  { slug: "marketing", name: "Marketing" },
  { slug: "sales", name: "Sales" },
  { slug: "customer_success", name: "Customer success" },
  { slug: "other", name: "Other" },
] as const;

export type Category = (typeof CATEGORIES)[number]["slug"];

export const ROLES: { slug: string; category: Category; name: string }[] = [
  { slug: "seo", category: "marketing", name: "SEO" },
  { slug: "content", category: "marketing", name: "Content" },
  { slug: "performance", category: "marketing", name: "Performance and paid" },
  { slug: "social", category: "marketing", name: "Social media" },
  { slug: "brand", category: "marketing", name: "Brand and communications" },
  { slug: "product_marketing", category: "marketing", name: "Product marketing" },
  { slug: "growth", category: "marketing", name: "Growth" },
  { slug: "lifecycle", category: "marketing", name: "Email and lifecycle" },
  { slug: "marketing_ops", category: "marketing", name: "Marketing operations" },
  { slug: "marketing_lead", category: "marketing", name: "Marketing leadership" },
  { slug: "sdr", category: "sales", name: "Sales development" },
  { slug: "account_executive", category: "sales", name: "Account executive" },
  { slug: "account_manager", category: "sales", name: "Account management" },
  { slug: "partnerships", category: "sales", name: "Partnerships" },
  { slug: "sales_ops", category: "sales", name: "Sales operations" },
  { slug: "sales_lead", category: "sales", name: "Sales leadership" },
  { slug: "cs_manager", category: "customer_success", name: "Customer success manager" },
  { slug: "onboarding", category: "customer_success", name: "Onboarding and implementation" },
  { slug: "support", category: "customer_success", name: "Customer support" },
  { slug: "cs_ops", category: "customer_success", name: "Customer success operations" },
  { slug: "cs_lead", category: "customer_success", name: "Customer success leadership" },
];

export const CURRENCIES = ["VND", "USD", "SGD", "THB", "MYR", "IDR", "PHP"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const roleName = (slug: string) => ROLES.find((r) => r.slug === slug)?.name ?? slug;
export const categoryName = (slug: string) => CATEGORIES.find((c) => c.slug === slug)?.name ?? slug;

// Languages people can list on their profile (ISO 639-1 codes). The database only checks the code's shape.
export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "vi", name: "Vietnamese" },
  { code: "th", name: "Thai" },
  { code: "ms", name: "Malay" },
  { code: "id", name: "Indonesian" },
  { code: "tl", name: "Filipino" },
  { code: "km", name: "Khmer" },
  { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "hi", name: "Hindi" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "es", name: "Spanish" },
];

export const PERIODS = [
  { value: "hour", label: "per hour" },
  { value: "month", label: "per month" },
  { value: "year", label: "per year" },
] as const;

export const WORKPLACES = [
  { value: "on_site", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
] as const;
