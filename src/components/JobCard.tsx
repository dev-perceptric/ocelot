import Link from "next/link";
import { formatSalary, formatWhere, postedAgo, type Job } from "@/lib/jobs";
import { Tag } from "@/components/ui";

// Order: role, company, where you can be hired from, pay, how recent. Promoted listings say so.
export function JobCard({ job, company }: { job: Job; company: string }) {
  const salary = formatSalary(job);
  const promoted = job.featured_until && new Date(job.featured_until) > new Date();
  return (
    <Link
      href={`/jobs/${job.slug}`}
      className="flex flex-col gap-1 border border-border bg-surface p-6 transition-colors duration-150 hover:border-ink rounded-[var(--radius-card)]"
    >
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-card font-bold">{job.title}</h3>
        {promoted ? <Tag tone="brand">Promoted listing</Tag> : null}
      </div>
      <p className="text-body">{[company, formatWhere(job)].filter(Boolean).join(" / ")}</p>
      {salary ? <p className="text-body font-bold">{salary}</p> : null}
      <p className="text-meta text-muted">{postedAgo(job.published_at)}</p>
    </Link>
  );
}
