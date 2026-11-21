import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Wordmark } from "@/components/ui";
import { readFilters, type Filters } from "@/lib/search";
import { seoHeading, seoPath } from "@/lib/seo";

export function SiteHeader() {
  return (
    <header className="bg-brand">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-5 md:px-8">
        <Link href="/" className="text-ink">
          <Wordmark className="text-[20px]" />
        </Link>
        <nav className="flex items-center gap-1 text-meta font-bold sm:gap-4 sm:text-body">
          <Link href="/companies" className="hidden px-2 py-2 hover:underline md:inline">Companies</Link>
          <Link href="/app" className="px-2 py-2 hover:underline">My search</Link>
          {/* Employers go straight to the prices, and from there straight to the job form. */}
          <Link href="/pricing"
            className="ml-1 inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap border border-ink px-3 hover:bg-ink hover:text-surface rounded-[var(--radius-control)] sm:px-4">
            Post a job <ArrowRight size={16} strokeWidth={2} aria-hidden />
          </Link>
        </nav>
      </div>
    </header>
  );
}

// Links to role, remote and place pages on every public page, so people and search engines find them. Each one is a
// Find jobs search with a clean address (src/lib/seo.ts).
const F = (f: Partial<Filters>) => ({ ...readFilters({}), ...f });
const FOOTER_GROUPS: { title: string; links: Filters[] }[] = [
  { title: "Jobs by role", links: [
    F({ category: "sales" }), F({ category: "marketing" }), F({ category: "customer_success" }), F({ role: "account_executive" }),
    F({ role: "sdr" }), F({ role: "account_manager" }), F({ role: "cs_manager" }), F({ role: "product_marketing" }),
  ] },
  { title: "Remote jobs", links: [
    F({ where: ["remote"] }), F({ where: ["remote"], category: "sales" }), F({ where: ["remote"], category: "marketing" }),
    F({ where: ["remote"], category: "customer_success" }), F({ where: ["remote"], role: "account_executive" }),
  ] },
  { title: "Jobs by place", links: [
    F({ country: "US" }), F({ country: "CA" }), F({ city: "new-york" }), F({ city: "san-francisco" }), F({ city: "toronto" }),
    F({ city: "austin" }), F({ city: "chicago" }), F({ city: "boston" }), F({ city: "seattle" }), F({ city: "vancouver" }),
  ] },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-[1200px] gap-8 px-5 pt-10 sm:grid-cols-3 md:px-8">
        {FOOTER_GROUPS.map((g) => (
          <nav key={g.title} aria-label={g.title}>
            <h2 className="text-meta font-bold text-ink">{g.title}</h2>
            <ul className="mt-3 flex flex-col gap-2 text-meta text-muted">
              {g.links.map((f) => {
                const href = seoPath(f);
                return href ? <li key={href}><Link href={href} className="hover:text-ink hover:underline">{seoHeading(f)}</Link></li> : null;
              })}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-5 py-10 text-meta text-muted md:flex-row md:items-center md:justify-between md:px-8">
        <Wordmark className="text-ink" />
        <nav className="flex flex-wrap gap-4">
          <Link href="/jobs" className="hover:text-ink">Find jobs</Link>
          <Link href="/companies" className="hover:text-ink">Companies</Link>
          <Link href="/pricing" className="hover:text-ink">Post a job</Link>
          <Link href="/login" className="hover:text-ink">Log in</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
        </nav>
        <p>joinocelot.com</p>
      </div>
    </footer>
  );
}
