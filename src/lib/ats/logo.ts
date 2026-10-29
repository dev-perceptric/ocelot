import "server-only";
import { lookup } from "node:dns/promises";
import { slugify } from "@/lib/jobs";
import { createAdmin } from "@/lib/supabase/server";
import type { Provider } from "./boards";
import { iconsFromHome, imageKind, isAtsHost, LOGO_TYPES, looksLikeCompany, privateAddress, safeUrl, siteHost, websiteFromBoardPage } from "./site";

// Logos for imported companies: the company's website comes from its job board page (where the board redirects
// to, or the site it links to), or a guess at <name>.com whose page title names the company. The logo is the
// site's square icon, saved in our own storage. A company that set its own logo is never touched.

const TEST_BASE = process.env.ATS_TEST_URL;
const MAX_PAGE = 2_000_000;
const MAX_IMAGE = 1_048_576;
const MIN_SIDE = 32;
const GOOD_SIDE = 96;

const BOARD_PAGES: Partial<Record<Provider, (b: string) => string>> = {
  greenhouse: (b) => `https://job-boards.greenhouse.io/${b}`,
  lever: (b) => `https://jobs.lever.co/${b}`,
  ashby: (b) => `https://jobs.ashbyhq.com/${b}`,
  smartrecruiters: (b) => `https://careers.smartrecruiters.com/${b}`,
  recruitee: (b) => `https://${b}.recruitee.com/`,
  workable: (b) => `https://apply.workable.com/${b}/`,
};

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
async function get(raw: string, max: number, fetchImpl: typeof fetch, cut = false): Promise<{ url: URL; type: string; body: Uint8Array } | null> {
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
    if (!res.ok) { await res.body?.cancel(); return null; }
    const body = await readCapped(res, max, cut);
    return body ? { url, type: (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase(), body } : null;
  }
  return null;
}

const text = (b: Uint8Array) => new TextDecoder().decode(b);

async function homePage(site: string, company: string, fetchImpl: typeof fetch, needTitle: boolean) {
  const page = await get(site, MAX_PAGE, fetchImpl, true);
  if (!page || !page.type.includes("html") || isAtsHost(page.url.hostname)) return null;
  const html = text(page.body);
  if (needTitle) {
    const title = slugify(html.match(/<title[^>]*>([^<]{1,300})/i)?.[1] ?? "").replace(/-/g, "");
    const name = slugify(company).replace(/-/g, "");
    if (!name || !title.includes(name)) return null;
  }
  return { url: page.url, html };
}

// The company's website and its home page.
async function findSite(name: string, provider: Provider, board: string, fetchImpl: typeof fetch) {
  const boardPage = BOARD_PAGES[provider]?.(board);
  const page = boardPage ? await get(boardPage, MAX_PAGE, fetchImpl, true) : null;
  if (page) {
    // A board that sends people to the company's own careers page.
    // A site that won't show us its home page still gets the icon search engines keep for it.
    const known = !isAtsHost(page.url.hostname) && looksLikeCompany(page.url.hostname, name)
      ? `https://${siteHost(page.url.hostname)}` : websiteFromBoardPage(text(page.body), name);
    if (known) return (await homePage(`${known}/`, name, fetchImpl, false)) ?? { url: new URL(`${known}/`), html: "" };
  }
  // A guess, kept only when the page's title names the company.
  const label = slugify(name).replace(/-/g, "");
  for (const tld of ["com", "io", "ai", "co"]) {
    if (!label) break;
    const home = await homePage(`https://${label}.${tld}/`, name, fetchImpl, true);
    if (home) return home;
  }
  return null;
}

export type FoundLogo = { website: string; type: string; ext: string; body: Uint8Array };

export async function findLogo(name: string, provider: Provider, board: string, fetchImpl: typeof fetch = fetch): Promise<FoundLogo | null> {
  const site = await findSite(name, provider, board, fetchImpl);
  if (!site) return null;
  const origin = site.url.origin;
  const tries = [
    ...iconsFromHome(site.html, site.url.toString()).slice(0, 4),
    `${origin}/apple-touch-icon.png`,
    `https://www.google.com/s2/favicons?domain=${site.url.hostname}&sz=128`,
  ];
  // The first icon that's big enough, or else the biggest small one.
  let best: { type: string; width: number; body: Uint8Array } | null = null;
  for (const icon of new Set(tries)) {
    const img = await get(icon, MAX_IMAGE, fetchImpl);
    const kind = img && imageKind(img.body);
    if (!img || !kind) continue;
    const width = kind.width ?? (img.body.length >= 1000 ? GOOD_SIDE : 0);
    if (width >= MIN_SIDE && width > (best?.width ?? 0)) best = { type: kind.type, width, body: img.body };
    if (width >= GOOD_SIDE) break;
  }
  return best && { website: `https://${siteHost(site.url.hostname)}`, type: best.type, ext: LOGO_TYPES[best.type], body: best.body };
}

// Looks for one company's logo and saves it. Only fills a logo or website the company hasn't set.
export async function saveLogo(org: { org_id: string; name: string; provider: string; board: string }, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const db = createAdmin();
  let found: FoundLogo | null = null;
  try { found = await findLogo(org.name, org.provider as Provider, org.board, fetchImpl); } catch (e) { console.error(`logo ${org.name} failed`, e); }
  await db.from("orgs").update({ logo_checked_at: new Date().toISOString() }).eq("id", org.org_id);
  if (!found) return false;
  const path = `${org.org_id}/board-logo.${found.ext}`;
  const { error } = await db.storage.from("logos").upload(path, found.body, { contentType: found.type, upsert: true });
  if (error) { console.error(`logo ${org.name} not saved`, error.message); return false; }
  const logo_url = `${db.storage.from("logos").getPublicUrl(path).data.publicUrl}?v=${Date.now().toString(36)}`;
  const { data } = await db.from("orgs").update({ logo_url }).eq("id", org.org_id).is("logo_url", null).select("id");
  await db.from("orgs").update({ website: found.website }).eq("id", org.org_id).is("website", null);
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
