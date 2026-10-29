import Link from "next/link";
import { CompanyLogo, Tag } from "@/components/ui";
import { formatSalary, formatWhere, postedAgo, type Job } from "@/lib/jobs";

// Order: role, company, where you can be hired from, pay, how recent. Promoted listings say so.
export function JobCard({ job, company, logo }: { job: Job; company: string; logo?: string | null }) {
  const salary = formatSalary(job);
  const promoted = job.featured_until && new Date(job.featured_until) > new Date();
  return (
    <Link
      href={`/jobs/${job.slug}`}
      className="flex gap-4 border border-border bg-surface p-5 transition-colors duration-150 hover:border-ink rounded-[var(--radius-card)] md:p-6"
    >
      <CompanyLogo name={company} src={logo} size={44} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-card font-bold">{job.title}</h3>
          {promoted ? <Tag tone="brand">Promoted listing</Tag> : null}
        </div>
        <p className="text-body">{[company, formatWhere(job)].filter(Boolean).join(" / ")}</p>
        {salary ? <p className="text-body font-bold">{salary}</p> : null}
        <p className="text-meta text-muted">{postedAgo(job.published_at)}</p>
      </div>
    </Link>
  );
}
