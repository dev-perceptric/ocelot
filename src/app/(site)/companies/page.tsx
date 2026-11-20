import type { Metadata } from "next";
import Link from "next/link";
import { CompanyLogo } from "@/components/ui";
import { hiringCompanies } from "@/lib/queries";

// The same for every visitor, so it is built once and refreshed every 10 minutes (hiringCompanies is cached that long too).
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Companies hiring",
  description: "Companies with open marketing, sales and customer success jobs on Ocelot.",
  alternates: { canonical: "/companies" },
};

// Every company with live jobs, most jobs first.
export default async function CompaniesPage() {
  const companies = await hiringCompanies();
  const jobs = companies.reduce((n, c) => n + c.jobs, 0);
  return (
    <div className="mx-auto max-w-[1200px] px-5 py-10 md:px-8 md:py-12">
      <h1 className="text-section-sm font-bold md:text-section">Companies hiring</h1>
      <p className="mt-3 text-body text-muted">
        {companies.length
          ? `${companies.length.toLocaleString("en-US")} companies with ${jobs.toLocaleString("en-US")} open jobs.`
          : "New companies are on the way."}
      </p>
      {companies.length ? (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => (
            <li key={c.slug}>
              <Link href={`/companies/${c.slug}`}
                className="flex h-full items-center gap-4 border border-border bg-surface p-4 hover:border-ink rounded-[var(--radius-card)]">
                <CompanyLogo name={c.name} src={c.logo_url} size={40} />
                <span className="min-w-0">
                  <span className="block truncate text-body font-bold">{c.name}</span>
                  <span className="block text-meta text-muted">View {c.jobs.toLocaleString("en-US")} {c.jobs === 1 ? "job" : "jobs"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
