// Job boards read through more than one call: Workday, BambooHR, Breezy, Rippling, Pinpoint, Teamtailor, Personio,
// Jobvite, JazzHR and iCIMS. Each reader lists the board's jobs, keeps the ones whose title Ocelot wants, and opens
// those (up to MAX_DETAILS) for their text and place. Pages that only show HTML are read from the JobPosting data
// they carry for search engines. Plain functions with no app imports, so tests can run them on saved pages.

import type { RawJob } from "./boards.ts";

export type Get = (url: string, init?: { post?: unknown; text?: boolean }) => Promise<unknown>;
export type ReadOpts = { get: Get; wanted: (title: string) => boolean };
export type Read = { jobs: RawJob[]; company: string | null };

export const MORE_PROVIDERS = ["workday", "bamboohr", "breezy", "rippling", "pinpoint", "teamtailor", "personio", "jobvite", "jazzhr", "icims"] as const;
export type MoreProvider = (typeof MORE_PROVIDERS)[number];
const MAX_DETAILS = 40;

type O = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const arr = (v: unknown) => (Array.isArray(v) ? (v as O[]) : v && typeof v === "object" ? [v as O] : []);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as O) : {});
const period = (v: unknown): "hour" | "month" | "year" | null => {
  const t = String(v ?? "").toLowerCase();
  return /hour/.test(t) ? "hour" : /month/.test(t) ? "month" : /year|annual/.test(t) ? "year" : null;
};
const place = (...parts: unknown[]) => parts.map(s).filter((p) => p && !/^unavailable$/i.test(p)).join(", ");
const titleCase = (slug: string) => slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
const decode = (t: string) => t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&rsquo;/g, "'").replace(/&nbsp;/g, " ");
const strip = (h: string) => decode(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const pageTitle = (html: string) => s(strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""));
const blank = (j: Partial<RawJob> & Pick<RawJob, "externalId" | "title" | "applyUrl">): RawJob => ({
  postingUrl: j.applyUrl, places: [], countries: [], remote: null, hybrid: null, employment: null, experience: null, html: null, text: null, salary: null, ...j,
});

// Opens jobs one by one (a few at a time), keeping those that load.
async function details<T>(items: T[], open: (item: T) => Promise<RawJob | null>): Promise<RawJob[]> {
  const out: RawJob[] = [];
  const queue = items.slice(0, MAX_DETAILS);
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const item = queue.shift()!;
      try { const j = await open(item); if (j) out.push(j); } catch { /* skip a job that won't open */ }
    }
  }));
  return out;
}

// ---------- JobPosting data on job pages ----------

export function jobFromPage(html: string): (Omit<Partial<RawJob>, "title"> & { company: string | null; title: string | null }) | null {
  for (const [, body] of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try { data = JSON.parse(body.trim()); } catch { continue; }
    const all = arr(data).flatMap((d) => [d, ...arr(obj(d)["@graph"])]);
    const p = all.find((d) => String(d["@type"] ?? "").includes("JobPosting"));
    if (!p) continue;
    const locs = arr(p.jobLocation).map((l) => obj(l.address));
    const reqs = arr(p.applicantLocationRequirements).map((r) => s(r.name)).filter(Boolean) as string[];
    const pay = obj(p.baseSalary), val = obj(pay.value);
    const min = num(val.minValue) ?? num(val.value), max = num(val.maxValue) ?? num(val.value);
    return {
      title: s(p.title),
      company: s(obj(p.hiringOrganization).name),
      html: s(p.description) ? decode(String(p.description)) : null,
      places: [...locs.map((a) => place(a.addressLocality, a.addressRegion, a.addressCountry)).filter(Boolean), ...reqs],
      countries: locs.map((a) => s(a.addressCountry) ?? s(obj(a.addressCountry).name)).filter(Boolean) as string[],
      remote: /TELECOMMUTE/i.test(String(p.jobLocationType ?? "")) ? true : null,
      employment: [p.employmentType].flat().map(s).filter(Boolean).join(", ") || null,
      salary: min !== null || max !== null ? { min, max, currency: s(pay.currency), period: period(val.unitText) } : null,
      applyUrl: s(p.url) ?? undefined,
    };
  }
  return null;
}

async function fromPage(get: Get, url: string, id: string, title: string, list: Partial<RawJob> = {}): Promise<RawJob | null> {
  const page = jobFromPage(String(await get(url, { text: true })));
  if (!page) return null;
  return blank({
    externalId: id, title: page.title ?? title, applyUrl: url, ...list,
    html: page.html ?? null, places: page.places?.length ? page.places : list.places ?? [], countries: page.countries ?? [],
    remote: page.remote ?? list.remote ?? null, employment: page.employment ?? list.employment ?? null, salary: page.salary ?? null,
  });
}

// ---------- Readers ----------

// Workday boards are "tenant.wdN.site" (salesforce.wd12.External_Career_Site). Its search finds our kinds of jobs.
export function workdayParts(board: string) {
  const [tenant, wd, ...rest] = board.split(".");
  const site = rest.join(".");
  if (!tenant || !/^wd\d+$/.test(wd ?? "") || !site) return null;
  const host = `${tenant}.${wd}.myworkdayjobs.com`;
  return { tenant, host, site, api: `https://${host}/wday/cxs/${tenant}/${site}`, home: `https://${host}/${site}` };
}

async function workday(board: string, { get, wanted }: ReadOpts): Promise<Read> {
  const w = workdayParts(board);
  if (!w) throw new Error("This Workday board link isn't complete.");
  const seen = new Map<string, O>();
  for (const term of ["sales", "marketing", "customer success"]) {
    for (let offset = 0; offset < 40; offset += 20) {
      const page = obj(await get(`${w.api}/jobs`, { post: { appliedFacets: {}, limit: 20, offset, searchText: term } }));
      const posts = arr(page.jobPostings);
      for (const p of posts) if (s(p.externalPath) && !seen.has(String(p.externalPath))) seen.set(String(p.externalPath), p);
      if (posts.length < 20 || offset + 20 >= Number(page.total ?? 0)) break;
    }
  }
  let company: string | null = null;
  const jobs = await details([...seen.values()].filter((p) => wanted(s(p.title) ?? "")), async (p) => {
    const d = obj(await get(`${w.api}${p.externalPath}`));
    const i = obj(d.jobPostingInfo);
    // Workday names the legal entity ("9999 Ochsner Clinic Foundation", "NRF Hong Kong"): keep it only when it
    // names the same company as the board.
    const org = s(obj(d.hiringOrganization).name)?.replace(/^\d+\s+/, "") ?? null;
    const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!company && org && (key(org).includes(key(w.tenant)) || key(w.tenant).includes(key(org).slice(0, 6)))) company = org;
    const remote = s(i.remoteType);
    return blank({
      externalId: s(i.id) ?? String(p.externalPath), title: s(i.title) ?? String(p.title),
      applyUrl: s(i.externalUrl) ?? `${w.home}${p.externalPath}`,
      places: [s(i.location), ...arr(i.additionalLocations).map((l) => s(l)), s(p.locationsText)].filter(Boolean) as string[],
      countries: [s(obj(i.country).descriptor)].filter(Boolean) as string[],
      remote: remote ? /remote/i.test(remote) : null, hybrid: remote ? /hybrid/i.test(remote) : null,
      employment: s(i.timeType), html: s(i.jobDescription),
    });
  });
  return { jobs, company: company ?? titleCase(w.tenant) };
}

async function bamboohr(board: string, { get, wanted }: ReadOpts): Promise<Read> {
  const base = `https://${board}.bamboohr.com/careers`;
  const list = arr(obj(await get(`${base}/list`)).result);
  const jobs = await details(list.filter((j) => wanted(s(j.jobOpeningName) ?? "")), async (j) => {
    const o = obj(obj(obj(await get(`${base}/${j.id}/detail`)).result).jobOpening);
    const loc = obj(o.location), ats = obj(o.atsLocation);
    const type = String(o.locationType ?? j.locationType ?? "");
    return blank({
      externalId: String(j.id), title: s(o.jobOpeningName) ?? String(j.jobOpeningName), applyUrl: s(o.jobOpeningShareUrl) ?? `${base}/${j.id}`,
      places: [place(loc.city, loc.state, loc.addressCountry), place(ats.city, ats.state ?? ats.province, ats.country)].filter(Boolean),
      countries: [s(ats.country), s(loc.addressCountry)].filter(Boolean) as string[],
      remote: type === "1" || o.isRemote === true ? true : null, hybrid: type === "2" ? true : null,
      employment: s(o.employmentStatusLabel), html: s(o.description),
    });
  });
  let company: string | null = null;
  if (jobs.length) {
    try { company = pageTitle(String(await get(base, { text: true })))?.replace(/^(careers?|jobs?)\s*[|–—-]\s*/i, "").replace(/\s*[|–—-]\s*(careers?|jobs?)$/i, "") ?? null; } catch { /* name from the board */ }
  }
  return { jobs, company: company ?? titleCase(board) };
}

async function breezy(board: string, { get, wanted }: ReadOpts): Promise<Read> {
  const list = arr(await get(`https://${board}.breezy.hr/json`));
  const jobs = await details(list.filter((j) => wanted(s(j.name) ?? "") && s(j.url)), (j) => {
    const loc = obj(j.location);
    return fromPage(get, String(j.url), String(j.id), String(j.name), {
      places: [place(loc.city, s(obj(loc.state).name), s(obj(loc.country).name)), s(loc.name)].filter(Boolean) as string[],
      countries: [s(obj(loc.country).id)].filter(Boolean) as string[], remote: loc.is_remote === true ? true : null, employment: s(obj(j.type).name),
    });
  });
  return { jobs, company: s(obj(list[0]?.company).name) ?? titleCase(board) };
}

async function rippling(board: string, { get, wanted }: ReadOpts): Promise<Read> {
  const api = `https://api.rippling.com/platform/api/ats/v1/board/${encodeURIComponent(board)}/jobs`;
  const list = arr(await get(api));
  let company: string | null = null;
  const jobs = await details(list.filter((j) => wanted(s(j.name) ?? "")), async (j) => {
    const d = obj(await get(`${api}/${j.uuid}`));
    company ??= s(d.companyName);
    const desc = obj(d.description);
    const places = (Array.isArray(d.workLocations) ? d.workLocations : [obj(j.workLocation).label]).map(s).filter(Boolean) as string[];
    const pay = arr(d.payRangeDetails)[0];
    return blank({
      externalId: String(j.uuid), title: s(d.name) ?? String(j.name), applyUrl: s(d.url) ?? String(j.url), places,
      remote: places.some((p) => /remote/i.test(p)) || null, employment: s(obj(d.employmentType).id),
      html: [s(desc.role), s(desc.company)].filter(Boolean).join("") || (typeof d.description === "string" ? d.description : null),
      salary: pay ? { min: num(pay.rangeStart), max: num(pay.rangeEnd), currency: s(pay.currency), period: period(pay.frequency) } : null,
    });
  });
  return { jobs, company: company ?? titleCase(board) };
}

async function pinpoint(board: string, { get, wanted }: ReadOpts): Promise<Read> {
  const list = arr(obj(await get(`https://${board}.pinpointhq.com/postings.json`)).data);
  const jobs = list.filter((j) => wanted(s(j.title) ?? "") && s(j.url)).map((j) => {
    const loc = obj(j.location);
    const parts = [["", j.description], [j.key_responsibilities_header, j.key_responsibilities], [j.skills_knowledge_expertise_header, j.skills_knowledge_expertise], [j.benefits_header, j.benefits]];
    const visible = j.compensation_visible === true;
    return blank({
      externalId: String(j.id), title: String(j.title), applyUrl: String(j.url),
      places: [place(loc.city, loc.province, loc.country), s(loc.name)].filter(Boolean) as string[],
      remote: j.workplace_type === "remote" ? true : null, hybrid: j.workplace_type === "hybrid" ? true : null, employment: s(j.employment_type_text),
      html: parts.filter(([, b]) => s(b)).map(([h, b]) => `${s(h) ? `<h3>${s(h)}</h3>` : ""}${b}`).join("") || null,
      salary: visible ? { min: num(j.compensation_minimum), max: num(j.compensation_maximum), currency: s(j.compensation_currency), period: period(j.compensation_frequency) } : null,
    });
  });
  return { jobs, company: titleCase(board) };
}

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
};
const tags = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "gi"))].map((m) => m[1]);

async function teamtailor(board: string, { get, wanted }: ReadOpts): Promise<Read> {
  const rss = String(await get(`https://${board}.teamtailor.com/jobs.rss`, { text: true }));
  const items = tags(rss, "item");
  const jobs = items.filter((i) => wanted(decode(tag(i, "title")))).map((i) => {
    const locs = tags(i, "tt:location");
    const status = tag(i, "remoteStatus");
    return blank({
      externalId: tag(i, "guid") || tag(i, "link"), title: decode(tag(i, "title")), applyUrl: tag(i, "link"),
      places: locs.map((l) => place(decode(tag(l, "tt:city")), decode(tag(l, "tt:country"))) || decode(tag(l, "tt:name"))).filter(Boolean),
      countries: locs.map((l) => decode(tag(l, "tt:country"))).filter(Boolean),
      remote: /fully|remote/i.test(status) && !/hybrid/i.test(status) ? true : null, hybrid: /hybrid/i.test(status) ? true : null,
      html: decode(tag(i, "description")) || null,
    });
  });
  return { jobs, company: decode(tag(items[0] ?? "", "company_name")) || decode(tag(rss, "title")) || titleCase(board) };
}

async function personio(board: string, { get, wanted }: ReadOpts): Promise<Read> {
  const xml = String(await get(`https://${board}.jobs.personio.de/xml`, { text: true }));
  const jobs = tags(xml, "position").filter((p) => wanted(decode(tag(p, "name")))).map((p) => {
    const id = tag(p, "id");
    const offices = [tag(p, "office"), ...tags(tag(p, "additionalOffices"), "office")].map(decode).filter(Boolean);
    const sal = tag(p, "salaryInformation");
    return blank({
      externalId: id, title: decode(tag(p, "name")), applyUrl: `https://${board}.jobs.personio.de/job/${id}`, places: offices,
      employment: [tag(p, "employmentType"), tag(p, "schedule")].filter(Boolean).join(", ") || null,
      html: tags(p, "jobDescription").map((d) => `<h3>${decode(tag(d, "name"))}</h3>${decode(tag(d, "value"))}`).join("") || null,
      salary: sal ? { min: num(tag(sal, "min")), max: num(tag(sal, "max")), currency: tag(sal, "currencyCode") || null, period: period(tag(sal, "type")) } : null,
    });
  });
  return { jobs, company: titleCase(board) };
}

async function jobvite(board: string, { get, wanted }: ReadOpts): Promise<Read> {
  const html = String(await get(`https://jobs.jobvite.com/${encodeURIComponent(board)}/jobs`, { text: true }));
  const rows = [...html.matchAll(/<td class="jv-job-list-name">\s*<a href="([^"]+)">([\s\S]*?)<\/a>[\s\S]*?<td class="jv-job-list-location">([\s\S]*?)<\/td>/gi)]
    .map(([, href, title, where]) => ({ url: new URL(href, "https://jobs.jobvite.com").toString(), title: strip(title), where: strip(where) }));
  const jobs = await details(rows.filter((r) => wanted(r.title)), (r) => fromPage(get, r.url, r.url.split("/").pop()!, r.title, { places: [r.where] }));
  return { jobs, company: pageTitle(html)?.replace(/\s*(careers?|jobs?)$/i, "") || titleCase(board) };
}

async function jazzhr(board: string, { get, wanted }: ReadOpts): Promise<Read> {
  const html = String(await get(`https://${board}.applytojob.com/apply`, { text: true }));
  const rows = [...html.matchAll(/<li class="list-group-item">[\s\S]*?<a href="(https:\/\/[^"]+\/apply\/([A-Za-z0-9]+)\/[^"]*)">([\s\S]*?)<\/a>([\s\S]*?)<\/li>/gi)]
    .map(([, url, id, title, rest]) => ({ url, id, title: strip(title), where: strip(rest.replace(/<i[^>]*><\/i>/g, "")) }));
  let company: string | null = null;
  const jobs = await details(rows.filter((r) => wanted(r.title)), async (r) => {
    const page = String(await get(r.url, { text: true }));
    company ??= jobFromPage(page)?.company ?? null;
    const p = jobFromPage(page);
    return p ? blank({ externalId: r.id, title: p.title ?? r.title, applyUrl: r.url, places: p.places?.length ? p.places : [r.where], countries: p.countries ?? [],
      remote: p.remote ?? null, employment: p.employment ?? null, html: p.html ?? null, salary: p.salary ?? null }) : null;
  });
  return { jobs, company: company ?? titleCase(board) };
}

// iCIMS boards are the careers host itself (careers-acme.icims.com).
async function icims(board: string, { get, wanted }: ReadOpts): Promise<Read> {
  if (!/^[a-z0-9-]+\.icims\.com$/.test(board)) throw new Error("This iCIMS board link isn't complete.");
  const rows: { url: string; id: string; title: string }[] = [];
  for (let pr = 0; pr < 10; pr++) {
    const html = String(await get(`https://${board}/jobs/search?pr=${pr}&in_iframe=1`, { text: true }));
    const found = [...html.matchAll(/<a[^>]+href="(https:\/\/[^"]+\/jobs\/(\d+)\/[^"?]+\/job)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)]
      .map(([, url, id, t]) => ({ url, id, title: strip(t).replace(/^job title\s*/i, "") }));
    const fresh = found.filter((f) => !rows.some((r) => r.id === f.id));
    rows.push(...fresh);
    if (!fresh.length) break;
  }
  let company: string | null = null;
  const jobs = await details(rows.filter((r) => wanted(r.title)), async (r) => {
    const page = String(await get(`${r.url}?in_iframe=1`, { text: true }));
    const p = jobFromPage(page);
    company ??= p?.company ?? null;
    return p ? blank({ externalId: r.id, title: p.title ?? r.title, applyUrl: r.url, places: p.places ?? [], countries: p.countries ?? [],
      remote: p.remote ?? null, employment: p.employment ?? null, html: p.html ?? null, salary: p.salary ?? null }) : null;
  });
  return { jobs, company: company ?? titleCase(board.split(".")[0].replace(/^(careers|jobs)-/, "")) };
}

export const READERS: Record<MoreProvider, (board: string, o: ReadOpts) => Promise<Read>> = {
  workday, bamboohr, breezy, rippling, pinpoint, teamtailor, personio, jobvite, jazzhr, icims,
};

// Where people see each board, for Admin and for finding the company's logo.
export function boardHome(p: MoreProvider, board: string): string | null {
  switch (p) {
    case "workday": return workdayParts(board)?.home ?? null;
    case "bamboohr": return `https://${board}.bamboohr.com/careers`;
    case "breezy": return `https://${board}.breezy.hr/`;
    case "rippling": return `https://ats.rippling.com/${board}/jobs`;
    case "pinpoint": return `https://${board}.pinpointhq.com/`;
    case "teamtailor": return `https://${board}.teamtailor.com/jobs`;
    case "personio": return `https://${board}.jobs.personio.de/`;
    case "jobvite": return `https://jobs.jobvite.com/${board}/jobs`;
    case "jazzhr": return `https://${board}.applytojob.com/apply`;
    case "icims": return `https://${board}/jobs`;
  }
}

// A link to one of these boards -> its provider and board name.
export function parseMoreLink(u: URL): { provider: MoreProvider; board: string } | null {
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);
  const sub = host.split(".")[0];
  let m: RegExpMatchArray | null;
  if ((m = host.match(/^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$/))) {
    const site = /^[a-z]{2}-[a-z]{2}$/i.test(parts[0] ?? "") ? parts[1] : parts[0];
    return site ? { provider: "workday", board: `${m[1]}.${m[2]}.${site}` } : null;
  }
  if (host.endsWith(".bamboohr.com")) return { provider: "bamboohr", board: sub };
  if (host.endsWith(".breezy.hr")) return { provider: "breezy", board: sub };
  if (host === "ats.rippling.com" && parts[0]) return { provider: "rippling", board: parts[0] };
  if (host.endsWith(".pinpointhq.com")) return { provider: "pinpoint", board: sub };
  if (host.endsWith(".teamtailor.com")) return { provider: "teamtailor", board: sub };
  if (/\.jobs\.personio\.(de|com)$/.test(host)) return { provider: "personio", board: sub };
  if (host === "jobs.jobvite.com" && parts[0]) return { provider: "jobvite", board: parts[0] };
  if (host.endsWith(".applytojob.com")) return { provider: "jazzhr", board: sub };
  if (/^[a-z0-9-]+\.icims\.com$/.test(host) && !["www", "cdn01", "cdn02", "images"].includes(sub)) return { provider: "icims", board: host };
  return null;
}
