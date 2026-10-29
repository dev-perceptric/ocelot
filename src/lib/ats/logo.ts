import "server-only";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { slugify } from "@/lib/jobs";
import { createAdmin } from "@/lib/supabase/server";
import { isClassic, type Provider } from "./boards";
import { boardHome } from "./readers";
import {
  guessLabels, iconsFromHome, imageKind, isAtsHost, LOGO_TYPES, logosFromBoardPage, looksLikeCompany, pngFromIco, privateAddress, safeUrl,
  siteFromLinks, siteHost, siteInName, websiteFromBoardPage,
} from "./site";

// Logos for imported companies, tried in this order until one is found:
// 1. The company's website, known from where its jobs link to, where its board sends people, the site its board
//    links to, or a website in its name. The logo is the site's icon (phone icon, drawn icon, largest icon,
//    then the icon search engines keep for it).
// 2. The logo the company uploaded to its job board.
// 3. A guess at its website (<name>.com, .io and others) whose page title names the company, and that site's icon.
// 4. <name>.com when that site turns robots away: the icon search engines keep for it.
// Saved in our own storage. A company that set its own logo is never touched.

const TEST_BASE = process.env.ATS_TEST_URL;
const MAX_PAGE = 2_000_000;
const MAX_IMAGE = 1_048_576;
const MIN_SIDE = 32;
const GOOD_SIDE = 96;

const BOARD_PAGES: Partial<Record<Provider, (b: string) => string[]>> = {
  greenhouse: (b) => [`https://job-boards.greenhouse.io/${b}`, `https://job-boards.eu.greenhouse.io/${b}`],
  lever: (b) => [`https://jobs.lever.co/${b}`, `https://jobs.eu.lever.co/${b}`],
  ashby: (b) => [`https://jobs.ashbyhq.com/${b}`],
  smartrecruiters: (b) => [`https://careers.smartrecruiters.com/${b}`],
  recruitee: (b) => [`https://${b}.recruitee.com/`],
  workable: (b) => [`https://apply.workable.com/${b}/`],
};
// Placeholder pictures some companies left on their job board ("Your logo here").
const PLACEHOLDERS = new Set(["691877f4c8be49bbd6620a643ac977c04ad95951cf0a4bf7a011bddf0bdfefca"]);
const GUESS_TLDS = ["com", "io", "ai", "co", "app", "ca"];

async function publicHost(host: string): Promise<boolean> {
  if (TEST_BASE) return true;
  try {
    const all = await lookup(host, { all: true });
    return all.length > 0 && all.every((r) => !privateAddress(r.address));
  } catch { return false; }
}

// Tests send every https address to the local stand-in: https://acme.com/x -> <ATS_TEST_URL>/web/acme.com/x
const wire = (u: URL) => (TEST_BASE ? `${TEST_BASE.replace(/\/$/, "")}/web/${u.host}${u.pathname}${u.search}` : u.toString());

// Reads at most `max` bytes. A page may be cut there (its icons are near the top); an image too big is refused.
async function readCapped(res: Response, max: number, cut: boolean): Promise<Uint8Array | null> {
  if ((!cut && Number(res.headers.get("content-length") ?? 0) > max) || !res.body) return null;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      if (!cut) return null;
      parts.push(value.slice(0, value.length - (size - max)));
      size = max;
      break;
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

// GET with redirects followed by hand, each stop checked. Returns the final address and the body.
async function get(raw: string, max: number, fetchImpl: typeof fetch, cut = false, blocked?: (url: URL) => void): Promise<{ url: URL; type: string; body: Uint8Array } | null> {
  let url = safeUrl(raw);
  for (let hop = 0; url && hop < 5; hop++) {
    if (!(await publicHost(url.hostname))) return null;
    let res: Response;
    try {
      res = await fetchImpl(wire(url), {
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Ocelot logo check; +https://joinocelot.com)", Accept: "text/html,image/*;q=0.9,*/*;q=0.8" },
      });
    } catch { return null; }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      await res.body?.cancel();
      // A plain http address is asked for over https.
      url = next ? safeUrl(new URL(next, url).toString().replace(/^http:/, "https:")) : null;
      continue;
    }
    if (!res.ok) {
      if ([401, 403, 429].includes(res.status)) blocked?.(url);
      await res.body?.cancel();
      return null;
    }
    const body = await readCapped(res, max, cut);
    return body ? { url, type: (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase(), body } : null;
  }
  return null;
}

const text = (b: Uint8Array) => new TextDecoder().decode(b);

async function homePage(site: string, company: string, fetchImpl: typeof fetch, needTitle: boolean, blocked?: (url: URL) => void) {
  const page = await get(site, MAX_PAGE, fetchImpl, true, blocked);
  if (!page || !page.type.includes("html") || (isAtsHost(page.url.hostname) && !looksLikeCompany(page.url.hostname, company))) return null;
  const html = text(page.body);
  if (needTitle) {
    const title = slugify(html.match(/<title[^>]*>([^<]{1,300})/i)?.[1] ?? "").replace(/-/g, "");
    const names = guessLabels(company).slice(0, 2).map((l) => l.replace(/-/g, "")).filter((n) => n.length >= 4);
    if (!names.some((n) => title.includes(n))) return null;
  }
  return { url: page.url, html };
}

type Best = { type: string; width: number; body: Uint8Array };

// The first picture that's big enough, or else the biggest small one. An .ico gives its largest PNG.
async function pickImage(urls: string[], fetchImpl: typeof fetch): Promise<Best | null> {
  let best: Best | null = null;
  for (const url of new Set(urls)) {
    const img = await get(url, MAX_IMAGE, fetchImpl);
    if (!img) continue;
    const body = pngFromIco(img.body) ?? img.body;
    const kind = imageKind(body);
    if (!kind || PLACEHOLDERS.has(createHash("sha256").update(body).digest("hex"))) continue;
    const width = kind.width ?? (body.length >= 1000 ? GOOD_SIDE : 0);
    if (width >= MIN_SIDE && width > (best?.width ?? 0)) best = { type: kind.type, width, body };
    if (width >= GOOD_SIDE) break;
  }
  return best;
}

async function siteIcon(site: { url: URL; html: string }, fetchImpl: typeof fetch): Promise<Best | null> {
  const host = site.url.hostname;
  return pickImage([
    ...iconsFromHome(site.html, site.url.toString()).slice(0, 4),
    `${site.url.origin}/apple-touch-icon.png`,
    `https://www.google.com/s2/favicons?domain=${host}&sz=128`,
    `${site.url.origin}/favicon.ico`,
    `https://icons.duckduckgo.com/ip3/${host}.ico`,
  ], fetchImpl);
}

export type FoundLogo = { website: string | null; type: string; ext: string; body: Uint8Array };
const found = (b: Best, site: URL | null): FoundLogo => ({ website: site ? `https://${siteHost(site.hostname)}` : null, type: b.type, ext: LOGO_TYPES[b.type], body: b.body });

export async function findLogo(name: string, provider: Provider, board: string, fetchImpl: typeof fetch = fetch, links: string[] = []): Promise<FoundLogo | null> {
  // The board page: where it sends people, the site it links to and the logo it shows.
  let page: { url: URL; html: string } | null = null;
  const pages = isClassic(provider) ? BOARD_PAGES[provider]?.(board) ?? [] : [boardHome(provider, board)].filter((u): u is string => !!u);
  for (const url of pages) {
    const p = await get(url, MAX_PAGE, fetchImpl, true);
    if (p) { page = { url: p.url, html: text(p.body) }; break; }
  }
  const known = [...siteFromLinks(links)];
  if (page && !isAtsHost(page.url.hostname) && looksLikeCompany(page.url.hostname, name)) known.push(`https://${siteHost(page.url.hostname)}`);
  const linked = page && websiteFromBoardPage(page.html, name);
  if (linked) known.push(linked);
  // A website in the company's name, or in the name its board gives its logo ("Ribbon.ai logo").
  const alts = page ? [...page.html.matchAll(/<img\b[^>]*\balt="([^"]{2,80}) logo"/gi)].map((m) => m[1]) : [];
  for (const n of [name, ...alts]) {
    const inName = siteInName(n);
    if (inName && looksLikeCompany(new URL(inName).hostname, name)) known.push(inName);
  }

  // 1. A known website. One that won't show us its home page still gets the icon search engines keep for it.
  for (const site of [...new Set(known)].slice(0, 3)) {
    const home = (await homePage(`${site}/`, name, fetchImpl, false)) ?? { url: new URL(`${site}/`), html: "" };
    const icon = await siteIcon(home, fetchImpl);
    if (icon) return found(icon, home.url);
  }
  // 2. The logo on the job board.
  if (page) {
    const logo = await pickImage(logosFromBoardPage(page.html, page.url.toString()).slice(0, 4), fetchImpl);
    if (logo) return found(logo, null);
  }
  // 3. A guessed website whose title names the company (for up to a minute).
  const stopAt = Date.now() + 60_000;
  const full = guessLabels(name)[0];
  let closed: URL | null = null; // <name>.com that turns robots away
  for (const tld of GUESS_TLDS) {
    for (const label of guessLabels(name).slice(0, 3)) {
      if (Date.now() > stopAt) return null;
      const exact = tld === "com" && label === full && full.length >= 5;
      const home = await homePage(`https://${label}.${tld}/`, name, fetchImpl, true, exact ? (u) => { closed = u; } : undefined);
      if (!home) continue;
      const icon = await siteIcon(home, fetchImpl);
      if (icon) return found(icon, home.url);
    }
  }
  // 4. The company's exact name as a .com that turns robots away (big companies often do): its search engine icon.
  if (closed) {
    const icon = await siteIcon({ url: closed, html: "" }, fetchImpl);
    if (icon) return found(icon, closed);
  }
  return null;
}

// Looks for one company's logo and saves it. Only fills a logo or website the company hasn't set.
export async function saveLogo(org: { org_id: string; name: string; provider: string; board: string }, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const db = createAdmin();
  let found: FoundLogo | null = null;
  try {
    const { data: jobs } = await db.from("jobs").select("apply_url, source_url").eq("org_id", org.org_id).limit(50);
    const links = (jobs ?? []).flatMap((j) => [j.apply_url, j.source_url]).filter((u): u is string => !!u);
    found = await findLogo(org.name, org.provider as Provider, org.board, fetchImpl, links);
  } catch (e) { console.error(`logo ${org.name} failed`, e); }
  await db.from("orgs").update({ logo_checked_at: new Date().toISOString() }).eq("id", org.org_id);
  if (!found) return false;
  const path = `${org.org_id}/board-logo.${found.ext}`;
  const { error } = await db.storage.from("logos").upload(path, found.body, { contentType: found.type, upsert: true });
  if (error) { console.error(`logo ${org.name} not saved`, error.message); return false; }
  const logo_url = `${db.storage.from("logos").getPublicUrl(path).data.publicUrl}?v=${Date.now().toString(36)}`;
  const { data } = await db.from("orgs").update({ logo_url }).eq("id", org.org_id).is("logo_url", null).select("id");
  if (found.website) await db.from("orgs").update({ website: found.website }).eq("id", org.org_id).is("website", null);
  return !!data?.length;
}

// One hourly run: every company due (up to 1,000), twelve at a time, for at most 8 minutes.
export async function runLogos(fetchImpl: typeof fetch = fetch, budgetMs = 480_000): Promise<number> {
  const { data: due, error } = await createAdmin().rpc("due_logos", { p_limit: 1000 });
  if (error) throw error;
  const queue = [...(due ?? [])];
  const stopAt = Date.now() + budgetMs;
  let saved = 0;
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (queue.length && Date.now() < stopAt) {
      const o = queue.shift()!;
      if (await saveLogo(o, fetchImpl)) saved++;
    }
  }));
  return saved;
}
