import { parseDescription } from "@/lib/jd";

// A job description laid out like a document: headings, paragraphs and real lists.
export function JobDescription({ text }: { text: string }) {
  return (
    <div className="max-w-[70ch] break-words font-[family-name:var(--font-editorial)] text-[18px] leading-[30px]">
      {parseDescription(text).map((b, i) =>
        b.type === "heading" ? (
          <h2 key={i} className="mt-8 font-[family-name:var(--font-ui)] text-card font-bold first:mt-0">{b.text}</h2>
        ) : b.type === "list" ? (
          b.ordered ? (
            <ol key={i} className="mt-3 list-decimal space-y-2 pl-6">{b.items.map((t, k) => <li key={k} className="pl-1">{t}</li>)}</ol>
          ) : (
            <ul key={i} className="mt-3 list-disc space-y-2 pl-6">{b.items.map((t, k) => <li key={k} className="pl-1">{t}</li>)}</ul>
          )
        ) : (
          <p key={i} className="mt-4 first:mt-0">{b.lines.map((l, k) => <span key={k}>{k ? <br /> : null}{l}</span>)}</p>
        ),
      )}
    </div>
  );
}
