import Link from "next/link";
import { JobDescription } from "@/components/JobDescription";
import { ButtonLink, CompanyLogo, Tag } from "@/components/ui";
import { CATEGORY, EMPLOYMENT, SENIORITY, formatSalary, formatWhere, postedAgo, type Job, type Org } from "@/lib/jobs";
import { roleName } from "@/lib/taxonomy";

// The job as candidates see it. Used by the public job page, the employer's preview and admin review,
// so all three always match.
export function JobView({ job, org, questions, mode = "public", aside, apply, save }: {
  job: Job;
  org: Pick<Org, "name" | "slug" | "logo_url" | "business_verified_at" | "email_verified_domain">;
  questions: string[];
  mode?: "public" | "preview";
  aside?: React.ReactNode; // extra controls under the apply box (e.g. Report)
  apply?: React.ReactNode; // the public page's own apply button ("Did you apply?" follows it)
  save?: React.ReactNode; // the public page's Save job button
}) {
  const live = job.status === "published";
  const closed = job.status === "closed" || job.status === "expired";
  const salary = formatSalary(job);
  const facts = [
    job.role ? roleName(job.role) : job.category && CATEGORY[job.category],
    job.employment_type && EMPLOYMENT[job.employment_type],
    job.seniority && SENIORITY[job.seniority],
  ].filter(Boolean) as string[];
  const company = mode === "public" ? (
    <Link href={`/companies/${org.slug}`} className="text-body font-bold underline">{org.name}</Link>
  ) : <span className="text-body font-bold">{org.name}</span>;

  return (
    <div className="grid gap-10 md:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <CompanyLogo name={org.name} src={org.logo_url} size={40} />
          {company}
          {org.business_verified_at ? <Tag tone="success">Company verified</Tag> : null}
          {org.email_verified_domain ? <Tag tone="info">Email verified</Tag> : null}
        </div>
        <h1 className="mt-4 text-section-sm font-bold md:text-section">{job.title || "Untitled job"}</h1>
        <p className="mt-3 text-body">{formatWhere(job) || "Where you can work isn't set yet"}</p>
        {salary ? <p className="mt-1 text-body font-bold">{salary}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {facts.map((f) => <Tag key={f}>{f}</Tag>)}
          {closed ? <Tag>This role has closed</Tag> : null}
        </div>
        <div className="mt-10">
          <JobDescription text={job.description} />
        </div>
        {questions.length && job.apply_method === "ocelot" ? (
          <section className="mt-10 max-w-[70ch]">
            <h2 className="text-card font-bold">Questions you&apos;ll answer when you apply</h2>
            <ol className="mt-3 list-decimal pl-6 text-body">
              {questions.map((q) => <li key={q} className="mt-1">{q}</li>)}
            </ol>
          </section>
        ) : null}
      </div>
      <aside className="flex h-fit flex-col gap-3 border border-border bg-surface p-6 rounded-[var(--radius-card)]">
        {closed ? (
          <p className="text-body">This role has closed.</p>
        ) : job.apply_method === "external" ? (
          <>
            {mode === "public" && live && job.apply_url ? (
              apply ?? <ButtonLink href={job.apply_url} target="_blank" rel="noopener nofollow">Apply on company site</ButtonLink>
            ) : (
              <span className="inline-flex min-h-11 items-center justify-center bg-brand px-5 font-bold rounded-[var(--radius-control)]">Apply on company site</span>
            )}
            <p className="text-meta text-muted">This opens the company&apos;s application page. After applying, mark the job as Applied.</p>
          </>
        ) : mode === "public" && live && apply ? (
          apply
        ) : (
          <span className="inline-flex min-h-11 items-center justify-center bg-brand px-5 font-bold rounded-[var(--radius-control)]">Apply</span>
        )}
        {mode === "public" && save ? save : null}
        {job.published_at ? <p className="text-meta text-muted">Posted {postedAgo(job.published_at).toLowerCase()}</p> : null}
        {aside}
      </aside>
    </div>
  );
}
