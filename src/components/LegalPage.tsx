import type { ReactNode } from "react";

// Long-form pages (Terms, Privacy): Lora body at a readable width, numbered sections with anchors.
export function LegalPage({ title, updated, intro, sections }: {
  title: string;
  updated: string;
  intro: ReactNode;
  sections: { id: string; title: string; body: ReactNode }[];
}) {
  return (
    <article className="mx-auto max-w-[760px] px-5 py-12 md:py-20">
      <h1 className="text-section-sm font-bold md:text-section">{title}</h1>
      <p className="mt-3 text-meta text-muted">Last updated {updated}</p>
      <div className="legal mt-8 font-[family-name:var(--font-editorial)] text-[18px] leading-[30px]">{intro}</div>
      <nav aria-label="Sections" className="mt-8 border-y border-border py-4">
        <ol className="grid gap-1 text-meta sm:grid-cols-2">
          {sections.map((s, i) => <li key={s.id}><a href={`#${s.id}`} className="underline">{i + 1}. {s.title}</a></li>)}
        </ol>
      </nav>
      {sections.map((s, i) => (
        <section key={s.id} id={s.id} className="mt-10 scroll-mt-6">
          <h2 className="text-card font-bold">{i + 1}. {s.title}</h2>
          <div className="legal mt-3 font-[family-name:var(--font-editorial)] text-[18px] leading-[30px]">{s.body}</div>
        </section>
      ))}
    </article>
  );
}
