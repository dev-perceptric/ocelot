// Companies' public job boards: where each one lives, how to read it, and how to tell which board a link is.
// Plain functions with no app imports, so tests can load them. No keys: these are the boards' public feeds.

import { MORE_PROVIDERS, parseMoreLink, type MoreProvider } from "./readers.ts";

// Boards read with one feed (and pages); the rest are read by readers.ts.
export type ClassicProvider = "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "recruitee" | "workable";
export type Provider = ClassicProvider | MoreProvider;
export const isClassic = (p: Provider): p is ClassicProvider => !(MORE_PROVIDERS as readonly string[]).includes(p);

export const PROVIDERS: Record<Provider, { name: string; example: string }> = {
  greenhouse: { name: "Greenhouse", example: "boards.greenhouse.io/stripe" },
  lever: { name: "Lever", example: "jobs.lever.co/palantir" },
  ashby: { name: "Ashby", example: "jobs.ashbyhq.com/ashby" },
  smartrecruiters: { name: "SmartRecruiters", example: "jobs.smartrecruiters.com/SmartRecruiters" },
  recruitee: { name: "Recruitee", example: "bunq.recruitee.com" },
  workable: { name: "Workable", example: "apply.workable.com/company" },
  workday: { name: "Workday", example: "salesforce.wd12.myworkdayjobs.com/External_Career_Site" },
  bamboohr: { name: "BambooHR", example: "company.bamboohr.com/careers" },
  breezy: { name: "Breezy", example: "company.breezy.hr" },
  rippling: { name: "Rippling", example: "ats.rippling.com/company/jobs" },
  pinpoint: { name: "Pinpoint", example: "company.pinpointhq.com" },
  teamtailor: { name: "Teamtailor", example: "company.teamtailor.com/jobs" },
  personio: { name: "Personio", example: "company.jobs.personio.de" },
  jobvite: { name: "Jobvite", example: "jobs.jobvite.com/company" },
  jazzhr: { name: "JazzHR", example: "company.applytojob.com/apply" },
  icims: { name: "iCIMS", example: "careers-company.icims.com/jobs" },
};
export const isProvider = (p: string): p is Provider => p in PROVIDERS;

// One job as the board describes it, before Ocelot's rules.
export type RawJob = {
  externalId: string;
  title: string;
  applyUrl: string;
  postingUrl: string;
  places: string[];      // location text, like "Singapore" or "Remote - APAC"
  countries: string[];   // country codes or names the board gives
  remote: boolean | null;
  hybrid: boolean | null;
  employment: string | null;
  experience: string | null;
  html: string | null;   // description as HTML
  text: string | null;   // description as plain text, when the board has it
  salary: { min: number | null; max: number | null; currency: string | null; period: "hour" | "month" | "year" | null } | null;
};

const BOARD = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

// "https://boards.greenhouse.io/stripe/jobs/123" -> { provider: "greenhouse", board: "stripe" }
export function parseBoardLink(input: string): { provider: Provider; board: string } | null {
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`); } catch { return null; }
  const host = u.hostname.toLowerCase();
  const first = u.pathname.split("/").filter(Boolean)[0] ?? "";
  const pick = (provider: Provider, board: string) => (BOARD.test(board) ? { provider, board } : null);
  if (/(^|\.)greenhouse\.io$/.test(host)) {
    const q = u.searchParams.get("for");
    return pick("greenhouse", q || (first === "embed" ? "" : first));
  }
  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") return pick("lever", first);
  if (host === "jobs.ashbyhq.com") return pick("ashby", first);
  if (host === "jobs.smartrecruiters.com" || host === "careers.smartrecruiters.com") return pick("smartrecruiters", first);
  if (host.endsWith(".recruitee.com")) return pick("recruitee", host.split(".")[0]);
  if (host === "apply.workable.com") return pick("workable", first);
  const more = parseMoreLink(u);
  return more && BOARD.test(more.board) ? more : null;
}

// Where each board's feed is. ATS_TEST_URL points every board at a local stand-in for tests.
export function feedUrl(p: ClassicProvider, board: string, testBase?: string): string {
  if (testBase) return `${testBase.replace(/\/$/, "")}/${p}/${board}`;
  const b = encodeURIComponent(board);
  switch (p) {
    case "greenhouse": return `https://boards-api.greenhouse.io/v1/boards/${b}/jobs?content=true`;
    case "lever": return `https://api.lever.co/v0/postings/${b}?mode=json`;
    case "ashby": return `https://api.ashbyhq.com/posting-api/job-board/${b}?includeCompensation=true`;
    case "smartrecruiters": return `https://api.smartrecruiters.com/v1/companies/${b}/postings?limit=100`;
    case "recruitee": return `https://${b}.recruitee.com/api/offers/`;
    case "workable": return `https://apply.workable.com/api/v1/widget/accounts/${b}?details=true`;
  }
}

// The next page of a feed, for boards that page (SmartRecruiters gives 100 at a time). null when there's no more.
export function nextPageUrl(p: ClassicProvider, board: string, json: unknown, testBase?: string): string | null {
  if (p !== "smartrecruiters") return null;
  const o = obj(json);
  const offset = Number(o.offset ?? 0), limit = Number(o.limit ?? 100), total = Number(o.totalFound ?? 0);
  if (!(offset + limit < total) || offset + limit >= 1000) return null;
  return `${feedUrl(p, board, testBase)}${testBase ? "?" : "&"}offset=${offset + limit}`;
}

// The company's name, when the feed says it.
export function feedCompany(p: ClassicProvider, json: unknown): string | null {
  const root = obj(json);
  if (p === "greenhouse") return s(arr(root.jobs)[0]?.company_name);
  if (p === "smartrecruiters") return s(obj(arr(root.content)[0]?.company).name);
  if (p === "recruitee") return s(arr(root.offers)[0]?.company_name);
  if (p === "workable") return s(root.name);
  return null;
}

export function detailUrl(p: ClassicProvider, board: string, id: string, testBase?: string): string | null {
  if (p !== "smartrecruiters") return null;
  if (testBase) return `${testBase.replace(/\/$/, "")}/${p}/${board}/${id}`;
  return `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(board)}/postings/${encodeURIComponent(id)}`;
}

type O = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const arr = (v: unknown) => (Array.isArray(v) ? (v as O[]) : []);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as O) : {});
const period = (v: unknown): "hour" | "month" | "year" | null => {
  const t = String(v ?? "").toLowerCase();
  return /hour/.test(t) ? "hour" : /month/.test(t) ? "month" : /year|annual/.test(t) ? "year" : null;
};

// Reads a board's feed into RawJobs. Anything missing a title, id or link is left out.
export function parseFeed(p: ClassicProvider, json: unknown): RawJob[] {
  const out: (RawJob | null)[] = [];
  const root = obj(json);
  if (p === "greenhouse") {
    for (const j of arr(root.jobs)) {
      const url = s(j.absolute_url);
      out.push(url ? {
        externalId: String(j.id ?? ""), title: s(j.title) ?? "", applyUrl: url, postingUrl: url,
        places: [s(obj(j.location).name), ...arr(j.offices).map((o) => s(o.name))].filter(Boolean) as string[],
        countries: [], remote: null, hybrid: null, employment: null, experience: null,
        html: s(j.content), text: null, salary: null,
      } : null);
    }
  } else if (p === "lever") {
    for (const j of arr(json)) {
      const c = obj(j.categories);
      const lists = arr(j.lists).map((l) => `<h3>${s(l.text) ?? ""}</h3><ul>${s(l.content) ?? ""}</ul>`).join("");
      const sr = obj(j.salaryRange);
      out.push({
        externalId: String(j.id ?? ""), title: s(j.text) ?? "", applyUrl: s(j.applyUrl) ?? s(j.hostedUrl) ?? "", postingUrl: s(j.hostedUrl) ?? "",
        places: [s(c.location), ...arr(c.allLocations).map((x) => s(x))].filter(Boolean) as string[],
        countries: [s(j.country)].filter(Boolean) as string[],
        remote: s(j.workplaceType) ? j.workplaceType === "remote" : null, hybrid: s(j.workplaceType) ? j.workplaceType === "hybrid" : null,
        employment: s(c.commitment), experience: null,
        html: `${s(j.description) ?? ""}${lists}${s(j.additional) ?? ""}` || null, text: null,
        salary: j.salaryRange ? { min: n(sr.min), max: n(sr.max), currency: s(sr.currency), period: period(sr.interval) } : null,
      });
    }
  } else if (p === "ashby") {
    for (const j of arr(root.jobs)) {
      if (j.isListed === false) continue;
      const addr = obj(obj(j.address).postalAddress);
      out.push({
        externalId: String(j.id ?? ""), title: s(j.title) ?? "", applyUrl: s(j.applyUrl) ?? s(j.jobUrl) ?? "", postingUrl: s(j.jobUrl) ?? "",
        places: [s(j.location), ...arr(j.secondaryLocations).map((l) => s(l.location))].filter(Boolean) as string[],
        countries: [s(addr.addressCountry), ...arr(j.secondaryLocations).map((l) => s(obj(obj(l.address).postalAddress).addressCountry))].filter(Boolean) as string[],
        remote: typeof j.isRemote === "boolean" ? j.isRemote : null, hybrid: s(j.workplaceType) ? /hybrid/i.test(String(j.workplaceType)) : null,
        employment: s(j.employmentType), experience: null,
        html: s(j.descriptionHtml), text: s(j.descriptionPlain), salary: null,
      });
    }
  } else if (p === "smartrecruiters") {
    for (const j of arr(root.content)) {
      const l = obj(j.location);
      const url = `https://jobs.smartrecruiters.com/${encodeURIComponent(String(obj(j.company).identifier ?? ""))}/${encodeURIComponent(String(j.id ?? ""))}`;
      out.push({
        externalId: String(j.id ?? ""), title: s(j.name) ?? "", applyUrl: url, postingUrl: url,
        places: [s(l.fullLocation), s(l.city)].filter(Boolean) as string[],
        countries: [s(l.country)].filter(Boolean) as string[],
        remote: typeof l.remote === "boolean" ? l.remote : null, hybrid: typeof l.hybrid === "boolean" ? l.hybrid : null,
        employment: s(obj(j.typeOfEmployment).label), experience: s(obj(j.experienceLevel).id),
        html: null, text: null, salary: null,
      });
    }
  } else if (p === "recruitee") {
    for (const j of arr(root.offers)) {
      if (j.status && j.status !== "published") continue;
      const sal = obj(j.salary);
      out.push({
        externalId: String(j.id ?? ""), title: s(j.title) ?? "", applyUrl: s(j.careers_apply_url) ?? s(j.careers_url) ?? "", postingUrl: s(j.careers_url) ?? "",
        places: [s(j.location), ...arr(j.locations).map((l) => s(l.name))].filter(Boolean) as string[],
        countries: [s(j.country_code), ...arr(j.locations).map((l) => s(l.country_code))].filter(Boolean) as string[],
        remote: typeof j.remote === "boolean" ? j.remote : null, hybrid: typeof j.hybrid === "boolean" ? j.hybrid : null,
        employment: s(j.employment_type_code), experience: s(j.experience_code),
        html: `${s(j.description) ?? ""}${s(j.requirements) ?? ""}` || null, text: null,
        salary: n(sal.min) !== null || n(sal.max) !== null ? { min: n(sal.min), max: n(sal.max), currency: s(sal.currency), period: period(sal.period) } : null,
      });
    }
  } else if (p === "workable") {
    for (const j of arr(root.jobs)) {
      const locs = arr(j.locations);
      out.push({
        externalId: String(j.shortcode ?? j.code ?? ""), title: s(j.title) ?? "", applyUrl: s(j.application_url) ?? s(j.url) ?? "", postingUrl: s(j.url) ?? s(j.shortlink) ?? "",
        places: [[s(j.city), s(j.country)].filter(Boolean).join(", "), ...locs.map((l) => [s(l.city), s(l.country)].filter(Boolean).join(", "))].filter(Boolean),
        countries: [s(j.country), ...locs.map((l) => s(l.countryCode) ?? s(l.country))].filter(Boolean) as string[],
        remote: typeof j.telecommuting === "boolean" ? j.telecommuting : null, hybrid: null,
        employment: s(j.employment_type), experience: s(j.experience),
        html: s(j.description), text: null, salary: null,
      });
    }
  }
  return out.filter((j): j is RawJob => Boolean(j && j.externalId && j.title && /^https?:\/\//.test(j.applyUrl)));
}

// SmartRecruiters lists jobs without their text; the detail call adds it.
export function parseDetail(p: ClassicProvider, json: unknown): { html: string | null; applyUrl: string | null } {
  if (p !== "smartrecruiters") return { html: null, applyUrl: null };
  const d = obj(json);
  const sec = obj(obj(d.jobAd).sections);
  const html = ["jobDescription", "qualifications", "additionalInformation"].map((k) => s(obj(sec[k]).text)).filter(Boolean).join("");
  return { html: html || null, applyUrl: s(d.applyUrl) ?? s(d.postingUrl) };
}
