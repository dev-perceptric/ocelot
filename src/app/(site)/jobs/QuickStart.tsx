import Link from "next/link";
import { CompanyLogo } from "@/components/ui";
import { countJobs, hiringCompanies, type HiringCompany } from "@/lib/queries";

// Under the search box on Find jobs (no search yet): how many jobs and companies are live, and the companies with the
// most jobs. The Industries, Workplace and Location filters cover what the old one-tap searches did.

export async function QuickStart() {
  const [jobs, companies] = await Promise.all([countJobs({}), hiringCompanies()]);
  return (
    <div className="mt-5">
      {jobs ? (
        <p className="text-body text-muted">
          <span className="font-bold text-ink">{jobs.toLocaleString("en-US")}</span> live jobs from{" "}
          <Link href="/companies" className="font-bold text-ink underline">{companies.length.toLocaleString("en-US")} companies</Link>
        </p>
      ) : null}
      {companies.length ? <CompanyRow companies={companies.slice(0, 8)} /> : null}
    </div>
  );
}

export function CompanyRow({ companies, title = "Companies hiring" }: { companies: HiringCompany[]; title?: string }) {
  return (
    <section className="mt-6">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-card font-bold">{title}</h2>
        <Link href="/companies" className="text-meta font-bold underline">All companies</Link>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {companies.map((c) => (
          <li key={c.slug}>
            <Link href={`/companies/${c.slug}`}
              className="flex h-full items-center gap-3 border border-border bg-surface p-3 hover:border-ink rounded-[var(--radius-card)]">
              <CompanyLogo name={c.name} src={c.logo_url} size={32} />
              <span className="min-w-0">
                <span className="block truncate text-body font-bold">{c.name}</span>
                <span className="block text-meta text-muted">{c.jobs.toLocaleString("en-US")} {c.jobs === 1 ? "job" : "jobs"}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
