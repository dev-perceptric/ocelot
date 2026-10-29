// Finding a company's website and its square icon from the pages its job board links to.
// Plain functions with no app imports, so tests can load them. The fetching lives in logo.ts.

import { slugify } from "../jobs.ts";

const ATS_HOSTS = /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|recruitee\.com|workable\.com|myworkdayjobs\.com|clinchtalent\.com|cloudfront\.net|amazonaws\.com|googleapis\.com|gstatic\.com|google\.com|linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|glassdoor\.com|tiktok\.com|github\.com|medium\.com|apple\.com)$/i;
const SUBDOMAIN = /^(www|careers|career|jobs|job|work|join|apply|team|about|en|us|go|hire|talent)\./i;

// Only public https addresses with a real name: no IP addresses, local or internal names.
export function safeUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":") || /(^|\.)(localhost|local|internal|lan|home|corp)$/.test(h)) return null;
  return u;
}

// careers.toasttab.com -> toasttab.com; www.stripe.com -> stripe.com
export function siteHost(host: string): string {
  let h = host.toLowerCase();
  while (SUBDOMAIN.test(h) && h.split(".").length > 2) h = h.replace(SUBDOMAIN, "");
  return h;
}

export const isAtsHost = (host: string) => ATS_HOSTS.test(host.toLowerCase());

// Does this website look like the company's? Its main name and the company's name share a word.
export function looksLikeCompany(host: string, company: string): boolean {
  const label = siteHost(host).split(".")[0].replace(/-/g, "");
  const name = slugify(company).replace(/-/g, "");
  const first = slugify(company).split("-")[0];
  if (!label || !name) return false;
  return label === name || (first.length >= 3 && label.startsWith(first)) || (label.length >= 4 && name.startsWith(label));
}

// The company's website named on its job board page, from the shapes the boards use.
export function websiteFromBoardPage(html: string, company: string): string | null {
  const ashby = html.match(/"publicWebsite"\s*:\s*"(https?:[^"]+)"/)?.[1];
  const candidates = [
    ...(ashby ? [ashby] : []),
    ...[...html.matchAll(/href="(https:\/\/[^"]+)"[^>]*>[^<]{0,80}\bHome\b/gi)].map((m) => m[1]),
    ...[...html.matchAll(/href="(https:\/\/[^"#?]+)/gi)].map((m) => m[1]),
  ];
  for (const c of candidates) {
    const u = safeUrl(c.replace(/\\\//g, "/"));
    if (u && !isAtsHost(u.hostname) && looksLikeCompany(u.hostname, company)) return `https://${siteHost(u.hostname)}`;
  }
  return null;
}

// Icons the home page names, best first: the square phone icon, then drawn (SVG) icons, then large icons, then
// any icon. One-color mask icons are left out.
export function iconsFromHome(html: string, base: string): string[] {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1] ?? "";
  const scored = links.flatMap((tag) => {
    const rel = attr(tag, "rel").toLowerCase();
    const href = attr(tag, "href");
    if (!href || !/icon/.test(rel) || /mask-icon/.test(rel)) return [];
    const svg = /\.svg(\?|$)/i.test(href) || /svg/i.test(attr(tag, "type"));
    const size = Number(attr(tag, "sizes").split("x")[0]) || 0;
    const score = (/apple-touch-icon/.test(rel) ? 1000 : 0) + (svg ? 500 : size);
    try { return [{ url: new URL(href, base).toString(), score }]; } catch { return []; }
  });
  return scored.sort((a, b) => b.score - a.score).map((s) => s.url);
}

export const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };

// The logo a company uploaded to its job board, as the board page shows it: Ashby's square logo then wordmark,
// the board's logo picture (Greenhouse "logo" class, Lever "<Company> logo"), or a share picture that's a logo.
// The job board's own logo is left out.
export function logosFromBoardPage(html: string, base: string): string[] {
  const urls: string[] = [];
  for (const key of ["logoSquareImageUrl", "logoWordmarkImageUrl"]) {
    const m = html.match(new RegExp(`"${key}"\\s*:\\s*"(https:[^"]+)"`));
    if (m) urls.push(m[1].replace(/\\u002F/g, "/").replace(/\\\//g, "/"));
  }
  const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] ?? "";
  for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
    const cls = attr(tag, "class"), alt = attr(tag, "alt"), src = attr(tag, "src");
    if (src && !/footer/i.test(cls) && (/(^|\s)logo(\s|$)/i.test(cls) || /\blogo$/i.test(alt))) urls.push(src);
  }
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (/(og|twitter):image"/i.test(tag) || /(og|twitter):image'/i.test(tag)) {
      const c = attr(tag, "content");
      if (/logo/i.test(c)) urls.push(c);
    }
  }
  const out = urls.flatMap((u) => { try { return [new URL(u, base).toString()]; } catch { return []; } })
    .filter((u) => !/(lever-logo|sr-logo|greenhouse-logo|ashby-logo|recruitee-logo|workable-logo)/i.test(u));
  return [...new Set(out)];
}

// The company's own website from where its jobs link to (a careers page on its own site), most used first.
export function siteFromLinks(links: (string | null | undefined)[]): string[] {
  const count = new Map<string, number>();
  for (const l of links) {
    const u = safeUrl(l?.replace(/^http:/, "https:"));
    if (!u || isAtsHost(u.hostname)) continue;
    const h = siteHost(u.hostname);
    count.set(h, (count.get(h) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => `https://${h}`);
}

// "Honeycomb.io", "Blockchain.com": the name is the website.
export function siteInName(name: string): string | null {
  const m = name.toLowerCase().match(/\b([a-z0-9-]+\.(?:com|io|ai|co|app|net|org|dev|so|xyz|tech|us|ca))\b/);
  return m ? `https://${m[1]}` : null;
}

// Website names to try for a company: the whole name, then without words like "Labs" or "Inc".
export function guessLabels(name: string): string[] {
  const words = slugify(name.replace(/\.[a-z]{2,4}\b/i, "")).split("-").filter(Boolean);
  const plain = words.filter((w) => !/^(inc|llc|ltd|corp|co|labs?|hq|ai|careers?|jobs|technologies|technology|group|holdings|the)$/.test(w));
  return [...new Set([words.join(""), plain.join(""), plain.join("-"), `get${plain.join("")}`, `${plain.join("")}hq`])].filter((l) => l.length >= 3);
}

// Drawn (SVG) logos are kept only when they're plain pictures: no scripts, events, embedded pages or outside links.
export function svgSafe(b: Uint8Array): boolean {
  if (b.length > 200_000) return false;
  const t = new TextDecoder().decode(b);
  if (!/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg\b/i.test(t)) return false;
  return !/<script|<foreignObject|<iframe|<embed|<object|<!ENTITY|\bon[a-z]+\s*=|javascript:|(?:xlink:)?href\s*=\s*["']?\s*(?!#)[^"'\s>]/i.test(t);
}

// An .ico file holding a PNG: the largest one.
export function pngFromIco(b: Uint8Array): Uint8Array | null {
  if (b.length < 6 || b[0] !== 0 || b[1] !== 0 || b[2] !== 1 || b[3] !== 0) return null;
  const count = b[4] | (b[5] << 8);
  let best: { w: number; data: Uint8Array } | null = null;
  for (let i = 0; i < count && 6 + i * 16 + 16 <= b.length; i++) {
    const e = 6 + i * 16;
    const w = b[e] || 256;
    const size = (b[e + 8] | (b[e + 9] << 8) | (b[e + 10] << 16) | (b[e + 11] << 24)) >>> 0;
    const off = (b[e + 12] | (b[e + 13] << 8) | (b[e + 14] << 16) | (b[e + 15] << 24)) >>> 0;
    if (off + size > b.length || size < 8) continue;
    const data = b.slice(off, off + size);
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 && w > (best?.w ?? 0)) best = { w, data };
  }
  return best?.data ?? null;
}

// Private and local addresses a public name could point at.
export function privateAddress(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return privateAddress(v.slice(7));
    return v === "::1" || v === "::" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to));

// The file's real type from its first bytes, and its width for PNGs. A safe SVG counts as large.
export function imageKind(b: Uint8Array): { type: string; width: number | null } | null {
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { type: "image/png", width: ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0 };
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "image/jpeg", width: null };
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return { type: "image/webp", width: null };
  if (svgSafe(b)) return { type: "image/svg+xml", width: 512 };
  return null;
}
