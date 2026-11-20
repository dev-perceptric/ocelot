import Link from "next/link";
import { ArrowRight, Bookmark, Building2, Globe, ListChecks, Lock, Search } from "lucide-react";
import { JobCard } from "@/components/JobCard";
import { Button, ButtonLink, CompanyLogo, inputClass } from "@/components/ui";
import { countJobs, hiringCompanies, listJobs, type HiringCompany } from "@/lib/queries";
import { extraOf, seoHeading } from "@/lib/seo";
import { seoPages, type SeoLink } from "@/lib/seoData";
import { CATEGORIES } from "@/lib/taxonomy";

// The same for every visitor, so it is built once and refreshed every 5 minutes (the job list is cached that long too).
export const revalidate = 300;

const n = (x: number) => x.toLocaleString("en-US");

// One-tap searches under the search box. Each one is a Find jobs page with its own address.
const QUICK: { label: string; href: string }[] = [
  { label: "Sales", href: "/sales-jobs" },
  { label: "Marketing", href: "/marketing-jobs" },
  { label: "Customer success", href: "/customer-success-jobs" },
  { label: "Account executive", href: "/account-executive-jobs" },
  { label: "Sales development", href: "/sales-development-jobs" },
  { label: "Remote", href: "/remote-jobs" },
  { label: "Canada", href: "/jobs-in-canada" },
];

const hasPlace = (l: SeoLink) => Boolean(l.f.country || l.f.region || l.f.city || l.f.where.includes("remote"));
const hasArea = (l: SeoLink) => Boolean(l.f.category || l.f.role);
const isRemote = (l: SeoLink) => l.f.where.includes("remote");

export default async function Home() {
  const [jobs, total, companies, pages] = await Promise.all([listJobs({ limit: 6 }), countJobs({}), hiringCompanies(), seoPages()]);
  const plain = pages.filter((l) => !extraOf(l.f));
  const areaOnly = plain.filter((l) => hasArea(l) && !hasPlace(l));
  const remoteAll = plain.find((l) => isRemote(l) && !hasArea(l) && !l.f.country && !l.f.region && !l.f.city);
  const areas = CATEGORIES.filter((c) => c.slug !== "other").map((c) => ({
    ...c,
    link: areaOnly.find((l) => l.f.category === c.slug && !l.f.role),
    roles: areaOnly.filter((l) => l.f.category === c.slug && l.f.role).slice(0, 4),
  }));

  return (
    <>
      {/* Search first: the box, one-tap searches and what's live right now. */}
      <section className="bg-canvas">
        <div className="mx-auto grid max-w-[1200px] gap-12 px-5 py-14 md:px-8 md:py-20 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <h1 className="text-display-sm font-black md:text-display">
              Find your <span className="highlight">next move.</span>
            </h1>
            <p className="mt-6 max-w-[620px] font-[family-name:var(--font-editorial)] text-lede">
              {total
                ? <>{n(total)} marketing, sales and customer success jobs from {n(companies.length)} companies. Free to search, free to track.</>
                : "Marketing, sales and customer success jobs. Free to search, free to track."}
            </p>
            <form action="/jobs" className="mt-8 flex max-w-[760px] flex-col gap-3 sm:flex-row" role="search">
              <label htmlFor="q" className="sr-only">Role, company, place or keyword</label>
              <div className="relative flex-1">
                <Search size={20} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
                <input id="q" name="q" placeholder="Role, company, place or keyword" className={`${inputClass} pl-12`} />
              </div>
              <Button type="submit" className="h-12 sm:w-48">Find jobs</Button>
            </form>
            <nav aria-label="Popular searches" className="mt-5 flex flex-wrap gap-2">
              {QUICK.map((q) => (
                <Link key={q.href} href={q.href}
                  className="inline-flex min-h-11 items-center border border-border bg-surface px-4 text-body hover:border-ink rounded-[var(--radius-control)]">
                  {q.label}
                </Link>
              ))}
            </nav>
          </div>

          {total ? (
            <dl className="grid grid-cols-3 gap-px overflow-hidden border border-border bg-border rounded-[var(--radius-card)] lg:grid-cols-1">
              <Stat icon={<ListChecks size={20} strokeWidth={1.75} aria-hidden />} value={n(total)} label="live jobs" href="/jobs" />
              <Stat icon={<Building2 size={20} strokeWidth={1.75} aria-hidden />} value={n(companies.length)} label="companies hiring" href="/companies" />
              {remoteAll ? <Stat icon={<Globe size={20} strokeWidth={1.75} aria-hidden />} value={n(remoteAll.jobs)} label="remote jobs" href={remoteAll.href} /> : null}
            </dl>
          ) : null}
        </div>
      </section>

      {companies.length ? <Companies companies={companies.slice(0, 8)} /> : null}

      {/* Browse by area: the three job families Ocelot covers, with their biggest roles. */}
      {areas.some((a) => a.link) ? (
        <section className="mx-auto max-w-[1200px] px-5 py-16 md:px-8 md:py-20">
          <h2 className="text-section-sm font-bold md:text-section">Browse by area</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {areas.map((a) => a.link ? (
              <div key={a.slug} className="flex flex-col border border-border bg-surface p-6 rounded-[var(--radius-card)]">
                <h3 className="text-card font-bold">{a.name}</h3>
                <p className="mt-1 text-meta text-muted">{n(a.link.jobs)} live jobs</p>
                <ul className="mt-5 flex flex-1 flex-col gap-3">
                  {a.roles.map((r) => (
                    <li key={r.href} className="flex items-baseline justify-between gap-3 border-b border-border pb-3 last:border-0">
                      <Link href={r.href} className="text-body hover:underline">{seoHeading(r.f)}</Link>
                      <span className="text-meta text-muted">{n(r.jobs)}</span>
                    </li>
                  ))}
                </ul>
                <Link href={a.link.href} className="mt-5 inline-flex items-center gap-2 text-body font-bold underline-offset-2 hover:underline">
                  All {a.name.toLowerCase()} jobs <ArrowRight size={18} strokeWidth={1.75} aria-hidden />
                </Link>
              </div>
            ) : null)}
          </div>
        </section>
      ) : null}

      {jobs.length ? (
        <section className="bg-canvas">
          <div className="mx-auto max-w-[1200px] px-5 py-16 md:px-8 md:py-20">
            <div className="flex items-end justify-between gap-4">
              <h2 className="text-section-sm font-bold md:text-section">New jobs</h2>
              <Link href="/jobs?sort=new" className="whitespace-nowrap font-bold underline">See all new jobs</Link>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {jobs.map((job) => <JobCard key={job.id} job={job} company={job.org?.name ?? ""} logo={job.org?.logo_url} />)}
            </div>
          </div>
        </section>
      ) : null}

      {/* My search: what the tracker does, in three steps. */}
      <section className="mx-auto max-w-[1200px] px-5 py-16 md:px-8 md:py-24">
        <div className="grid gap-10 lg:grid-cols-[1fr_440px]">
          <div>
            <h2 className="text-section-sm font-bold md:text-section">Your entire job search, organized.</h2>
            <p className="mt-4 max-w-[620px] font-[family-name:var(--font-editorial)] text-lede">
              Track jobs from Ocelot and jobs you found elsewhere, from first save to signed offer.
            </p>
            <ol className="mt-8 grid gap-6 sm:grid-cols-3">
              <Step icon={<Bookmark size={24} strokeWidth={1.75} aria-hidden />} title="Save any job"
                line="Save a job here, or add one you found on another site." />
              <Step icon={<ListChecks size={24} strokeWidth={1.75} aria-hidden />} title="Track every stage"
                line="Move it from Saved to Applied to Interviewing. Add tasks and dates." />
              <Step icon={<Lock size={24} strokeWidth={1.75} aria-hidden />} title="Keep it private"
                line="Only you can see your notes. Employers can't access your tracker." />
            </ol>
            <ButtonLink href="/app" variant="outline" className="mt-8">Start tracking</ButtonLink>
          </div>
          <div className="flex flex-col justify-between bg-ink p-8 text-surface rounded-[var(--radius-card)] md:p-10">
            <div>
              <h2 className="text-section-sm font-bold">Meet your next great hire.</h2>
              <p className="mt-4 font-[family-name:var(--font-editorial)] text-lede">
                Publish a role and manage applicants in one straightforward workspace.
              </p>
            </div>
            <ButtonLink href="/for-employers" variant="outline" className="mt-8 self-start border-surface text-surface hover:bg-surface hover:text-ink">
              Post a job
            </ButtonLink>
          </div>
        </div>
      </section>

    </>
  );
}

function Stat({ icon, value, label, href }: { icon: React.ReactNode; value: string; label: string; href: string }) {
  return (
    <Link href={href} className="flex flex-col gap-1 bg-surface p-5 hover:bg-canvas lg:flex-row lg:items-center lg:gap-4">
      <span className="hidden text-muted lg:block">{icon}</span>
      <span className="flex flex-col">
        <dt className="order-2 text-meta text-muted">{label}</dt>
        <dd className="order-1 text-title font-black">{value}</dd>
      </span>
    </Link>
  );
}

function Companies({ companies }: { companies: HiringCompany[] }) {
  return (
    <section className="mx-auto max-w-[1200px] px-5 pt-16 md:px-8 md:pt-20">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-section-sm font-bold md:text-section">Companies hiring now</h2>
        <Link href="/companies" className="whitespace-nowrap font-bold underline">All companies</Link>
      </div>
      <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {companies.map((c, i) => (
          <li key={c.slug} className={i >= 4 ? "hidden sm:block" : undefined}>
            <Link href={`/companies/${c.slug}`}
              className="flex h-full flex-col items-start gap-4 border border-border bg-surface p-5 hover:border-ink rounded-[var(--radius-card)]">
              <span className="flex h-10 items-center"><CompanyLogo name={c.name} src={c.logo_url} size={40} /></span>
              <span className="min-w-0">
                <span className="block truncate text-body font-bold">{c.name}</span>
                <span className="block text-meta text-muted">{n(c.jobs)} {c.jobs === 1 ? "job" : "jobs"}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Step({ icon, title, line }: { icon: React.ReactNode; title: string; line: string }) {
  return (
    <li className="flex flex-col gap-2">
      <span className="flex size-11 items-center justify-center bg-brand rounded-[var(--radius-control)]">{icon}</span>
      <h3 className="mt-2 text-body font-bold">{title}</h3>
      <p className="text-body text-muted">{line}</p>
    </li>
  );
}
