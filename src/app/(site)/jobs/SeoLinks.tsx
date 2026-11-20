import Link from "next/link";
import { extraByKey, extraOf, seoHeading, seoPath } from "@/lib/seo";
import { seoPages, type SeoLink } from "@/lib/seoData";
import type { Filters } from "@/lib/search";

const sameArea = (a: Filters, b: Filters) => a.category === b.category && a.role === b.role;
const samePlace = (a: Filters, b: Filters) => a.country === b.country && a.region === b.region && a.city === b.city && a.where.includes("remote") === b.where.includes("remote");
const sameExtra = (a: Filters, b: Filters) => (extraOf(a) ?? "") === (extraOf(b) ?? "");
const hasPlace = (f: Filters) => Boolean(f.country || f.region || f.city || f.where.includes("remote"));
const hasArea = (f: Filters) => Boolean(f.category || f.role);

function Group({ title, links, label }: { title: string; links: SeoLink[]; label?: (l: SeoLink) => string }) {
  if (!links.length) return null;
  return (
    <section className="mt-10">
      <h2 className="text-card font-bold">{title}</h2>
      <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => (
          <li key={l.href}><Link href={l.href} className="text-body underline-offset-2 hover:underline">{label ? label(l) : seoHeading(l.f)}</Link> <span className="text-meta text-muted">{l.jobs.toLocaleString("en-US")}</span></li>
        ))}
      </ul>
    </section>
  );
}

// Links between role, place and extra-filter pages, so people and search engines can move between them. Only pages
// with enough jobs to be listed.
export async function SeoLinks({ filters: f }: { filters?: Filters }) {
  const pages = await seoPages();
  if (!f) {
    const plain = pages.filter((l) => !extraOf(l.f));
    const remote = (l: SeoLink) => l.f.where.includes("remote");
    const placeOnly = (l: SeoLink) => !hasArea(l.f) && !remote(l);
    return (
      <>
        <Group title="Popular searches" links={plain.filter((l) => !remote(l) && !placeOnly(l)).slice(0, 24)} />
        <Group title="Remote jobs" links={plain.filter(remote).slice(0, 12)} />
        <Group title="Jobs by place" links={plain.filter(placeOnly).slice(0, 15)} />
        <Group title="By level, type and pay" links={pages.filter((l) => extraOf(l.f) && !hasPlace(l.f)).slice(0, 18)} />
      </>
    );
  }
  const here = (l: SeoLink) => sameArea(l.f, f) && samePlace(l.f, f) && sameExtra(l.f, f);
  const extraKey = extraOf(f) ?? "";
  const base: Filters = { ...f, level: [], type: [], minPay: null, where: f.where.filter((w) => w === "remote") };
  const baseHref = extraKey ? seoPath(base) : null;
  const baseLink = baseHref ? pages.find((l) => l.href === baseHref) : undefined;
  return (
    <>
      {/* The same search narrowed by level, type, workplace or pay; or, on such a page, the others and the way back. */}
      <Group title={extraKey ? `More ways to narrow ${seoHeading(base).toLowerCase()}` : "Narrow it down"}
        links={[...(baseLink ? [baseLink] : []), ...pages.filter((l) => sameArea(l.f, f) && samePlace(l.f, f) && extraOf(l.f) && !here(l))].slice(0, 15)}
        label={(l) => { const k = extraOf(l.f); return k ? extraByKey(k)!.label : `All ${seoHeading(l.f).charAt(0).toLowerCase()}${seoHeading(l.f).slice(1)}`; }} />
      {hasArea(f) ? <Group title={`More ${seoHeading({ ...f, country: null, region: null, city: null, where: f.where.filter((w) => w !== "remote") }).toLowerCase()}`}
        links={pages.filter((l) => sameArea(l.f, f) && sameExtra(l.f, f) && !here(l) && hasPlace(l.f)).slice(0, 18)} /> : null}
      {hasPlace(f) || extraKey ? <Group title={hasPlace(f) ? "Other roles here" : "Other roles"}
        links={pages.filter((l) => samePlace(l.f, f) && sameExtra(l.f, f) && !here(l) && hasArea(l.f)).slice(0, 18)} /> : null}
    </>
  );
}
