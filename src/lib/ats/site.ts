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

// Icons the home page names, best first: the square phone icon, then large icons, then any icon. No SVG.
export function iconsFromHome(html: string, base: string): string[] {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1] ?? "";
  const scored = links.flatMap((tag) => {
    const rel = attr(tag, "rel").toLowerCase();
    const href = attr(tag, "href");
    if (!href || !/icon/.test(rel) || /\.svg(\?|$)/i.test(href) || /svg/i.test(attr(tag, "type"))) return [];
    const size = Number(attr(tag, "sizes").split("x")[0]) || 0;
    const score = (/apple-touch-icon/.test(rel) ? 1000 : 0) + size;
    try { return [{ url: new URL(href, base).toString(), score }]; } catch { return []; }
  });
  return scored.sort((a, b) => b.score - a.score).map((s) => s.url);
}

export const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

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

// The file's real type from its first bytes, and its width for PNGs.
export function imageKind(b: Uint8Array): { type: string; width: number | null } | null {
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { type: "image/png", width: ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0 };
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "image/jpeg", width: null };
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return { type: "image/webp", width: null };
  return null;
}
