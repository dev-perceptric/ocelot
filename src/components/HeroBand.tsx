import type { Hero } from "@/lib/heroes";

// The top of a role or place page: heading and facts on the left, a photo on the right. On phones the photo is a short
// strip above the heading, so the job list still starts near the top. Pages with no photo show the heading alone.
export function HeroBand({ hero, children }: { hero: Hero | null; children: React.ReactNode }) {
  if (!hero) return <>{children}</>;
  return (
    <div className="grid items-center gap-4 lg:grid-cols-[1.25fr_1fr] lg:gap-8">
      <div className="min-w-0">{children}</div>
      <figure className="relative order-first h-32 overflow-hidden bg-canvas rounded-[var(--radius-card)] sm:h-44 lg:order-none lg:h-64">
        {/* A plain img: the files are already sized and compressed, and this one is the first thing on the page. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/heroes/${hero.file}`} alt={hero.alt} width={960} height={540} fetchPriority="high"
          className="h-full w-full object-cover" style={{ objectPosition: hero.focus ?? "center" }} />
        <figcaption className="absolute bottom-2 right-2 bg-surface/85 px-1.5 text-label text-muted rounded-[var(--radius-control)]">
          Photo: <a href={hero.source} className="underline" rel="nofollow noopener" target="_blank">{hero.credit}</a>, {hero.license}
        </figcaption>
      </figure>
    </div>
  );
}
