import Link from "next/link";
import { seoHeading } from "@/lib/seo";
import { seoPages, type SeoLink } from "@/lib/seoData";
import type { Filters } from "@/lib/search";

const sameArea = (a: Filters, b: Filters) => a.category === b.category && a.role === b.role;
const samePlace = (a: Filters, b: Filters) => a.country === b.country && a.region === b.region && a.city === b.city && a.where.join() === b.where.join();

function Group({ title, links }: { title: string; links: SeoLink[] }) {
  if (!links.length) return null;
  return (
    <section className="mt-10">
      <h2 className="text-card font-bold">{title}</h2>
      <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => (
          <li key={l.href}><Link href={l.href} className="text-body underline-offset-2 hover:underline">{seoHeading(l.f)}</Link> <span className="text-meta text-muted">{l.jobs.toLocaleString("en-US")}</span></li>
        ))}
      </ul>
    </section>
  );
}

// Links between role and place pages, so people and search engines can move between them. Only pages with jobs.
export async function SeoLinks({ filters: f }: { filters?: Filters }) {
  const pages = await seoPages();
  if (!f) return <Group title="Popular searches" links={pages.slice(0, 30)} />;
  const here = (l: SeoLink) => sameArea(l.f, f) && samePlace(l.f, f);
  const hasPlace = Boolean(f.country || f.region || f.city || f.where.length);
  const hasArea = Boolean(f.category || f.role);
  return (
    <>
      {hasArea ? <Group title={`More ${seoHeading({ ...f, country: null, region: null, city: null, where: [] }).toLowerCase()}`} links={pages.filter((l) => sameArea(l.f, f) && !here(l) && (l.f.country || l.f.region || l.f.city || l.f.where.length)).slice(0, 18)} /> : null}
      {hasPlace ? <Group title="Other roles here" links={pages.filter((l) => samePlace(l.f, f) && !here(l) && (l.f.category || l.f.role)).slice(0, 18)} /> : null}
    </>
  );
}
