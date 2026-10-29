// Job descriptions are plain text (typed by employers or cleaned from job boards). This reads their shape back:
// headings, paragraphs and lists, so the job page can show them like a document. Plain functions for tests.

export type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "list"; ordered: boolean; items: string[] };

const BULLET = /^(?:[•●▪◦·]\s*|[*–—-]\s+|o\s+)/;
const NUMBER = /^\d{1,2}[.)]\s+/;

// A short line on its own that reads like a title: "Role", "What you'll do", "Requirements:".
function headingLike(line: string): boolean {
  const t = line.replace(/:$/, "").trim();
  if (!t || t.length > 80 || t.split(/\s+/).length > 10) return false;
  if (/[.!?,;]$/.test(t) || t.includes(":") || t.includes("$") || /^https?:/i.test(t)) return false;
  return /^[\p{Lu}\d(]/u.test(t);
}

export function parseDescription(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let waiting = false; // a bullet with its words on the next line
  const endPara = () => { if (para.length) blocks.push({ type: "paragraph", lines: para }); para = []; };
  const endList = () => { if (list?.items.length) blocks.push({ type: "list", ...list }); list = null; };

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) { endPara(); continue; }
    if (line.startsWith("## ")) { endPara(); endList(); blocks.push({ type: "heading", text: line.slice(3).trim() }); continue; }
    const bullet = BULLET.test(line) || /^[•●▪◦·]$/.test(line);
    const numbered = !bullet && NUMBER.test(line);
    if (bullet || numbered) {
      endPara();
      const ordered = numbered;
      if (!list || list.ordered !== ordered) { endList(); list = { ordered, items: [] }; }
      const words = line.replace(numbered ? NUMBER : BULLET, "").trim();
      if (words) list.items.push(words);
      waiting = !words;
      continue;
    }
    if (list && waiting) { list.items.push(line); waiting = false; continue; }
    endList();
    para.push(line);
  }
  endPara();
  endList();

  // Short lines standing alone before more text are headings; so is a short last line ending in ":" before a list.
  const out: Block[] = [];
  blocks.forEach((b, i) => {
    const next = blocks[i + 1];
    if (b.type === "paragraph" && next) {
      const last = b.lines[b.lines.length - 1];
      if (b.lines.length === 1 && headingLike(last)) return out.push({ type: "heading", text: last.replace(/:$/, "") });
      if (b.lines.length > 1 && next.type === "list" && last.endsWith(":") && headingLike(last)) {
        out.push({ type: "paragraph", lines: b.lines.slice(0, -1) });
        return out.push({ type: "heading", text: last.replace(/:$/, "") });
      }
    }
    out.push(b);
  });
  return out;
}
