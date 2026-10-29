// Company names from job boards. Boards sometimes give a team or page name ("HackerRank Careers", "Wise Worksite
// Field Sales"), or belong to a different company than the one Ocelot looked for. Plain functions for tests.

const FILLER = /^(inc|llc|ltd|limited|co|corp|corporation|company|careers?|jobs?|hiring|hq|labs?|group|technologies|technology|the)$/;

const words = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
const core = (name: string) => words(name).filter((w) => !FILLER.test(w));

// "HackerRank Careers" -> "HackerRank"; "Acme Jobs" -> "Acme". Keeps the name when nothing would be left.
export function cleanCompanyName(name: string): string {
  const out = name.trim().replace(/\s+/g, " ").replace(/[\s,|–—-]+(careers?|jobs?|job board|hiring|career site|careers page)$/i, "").trim();
  return out || name.trim();
}

// Is the company on the board the one Ocelot looked for? The same name once filler words are dropped, written
// together or apart ("Hacker Rank"), or one name plus one more word ("Scale" and "Scale AI").
export function sameCompany(lookedFor: string, onBoard: string): boolean {
  const a = core(lookedFor), b = core(onBoard);
  if (!a.length || !b.length) return words(lookedFor).join("") === words(onBoard).join("");
  if (a.join("") === b.join("")) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return long.length - short.length <= 1 && short.every((w, i) => long[i] === w);
}
