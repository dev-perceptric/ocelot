import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { feedUrl, parseBoardLink, parseDetail, parseFeed, type Provider } from "../src/lib/ats/boards.ts";
import { guessRole, guessSeniority, htmlToText, importedSlug, mapEmployment, readPlaces, toJob } from "../src/lib/ats/normalize.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/ats/${name}.json`, import.meta.url), "utf8"));
const SEA = { countries: ["VN", "SG", "TH", "MY", "ID", "PH"], niche_only: true };

test("job board links tell the board apart", () => {
  const cases: [string, Provider, string][] = [
    ["https://boards.greenhouse.io/stripe/jobs/123", "greenhouse", "stripe"],
    ["job-boards.greenhouse.io/airwallex", "greenhouse", "airwallex"],
    ["https://boards.greenhouse.io/embed/job_board?for=gitlab", "greenhouse", "gitlab"],
    ["https://jobs.lever.co/palantir/6ed76ce8", "lever", "palantir"],
    ["https://jobs.ashbyhq.com/ashby", "ashby", "ashby"],
    ["https://jobs.smartrecruiters.com/SmartRecruiters/744000158320111", "smartrecruiters", "SmartRecruiters"],
    ["https://bunq.recruitee.com/o/support", "recruitee", "bunq"],
    ["https://apply.workable.com/acme/j/ABC123/", "workable", "acme"],
  ];
  for (const [link, provider, board] of cases) assert.deepEqual(parseBoardLink(link), { provider, board }, link);
  assert.equal(parseBoardLink("https://example.com/careers"), null);
  assert.equal(parseBoardLink("not a link at all"), null);
  assert.equal(feedUrl("lever", "palantir"), "https://api.lever.co/v0/postings/palantir?mode=json");
  assert.equal(feedUrl("greenhouse", "x", "http://127.0.0.1:4244/"), "http://127.0.0.1:4244/greenhouse/x");
});

test("each board's real feed reads into jobs with a title, id and link", () => {
  for (const [p, file] of [["greenhouse", "greenhouse"], ["lever", "lever"], ["ashby", "ashby"], ["smartrecruiters", "smartrecruiters"], ["recruitee", "recruitee"]] as [Provider, string][]) {
    const jobs = parseFeed(p, fixture(file));
    assert.ok(jobs.length >= 1, p);
    for (const j of jobs) assert.ok(j.externalId && j.title && /^https:\/\//.test(j.applyUrl), `${p}: ${j.title}`);
  }
  const gh = parseFeed("greenhouse", fixture("greenhouse"));
  assert.equal(gh[0].places[0], "Singapore");
  const lv = parseFeed("lever", fixture("lever"))[0];
  assert.deepEqual([lv.countries[0], lv.hybrid, lv.employment], ["SG", true, "Full-time"]);
  assert.ok(lv.applyUrl.endsWith("/apply"));
  const detail = parseDetail("smartrecruiters", fixture("smartrecruiters-detail"));
  assert.ok(detail.html && detail.html.length > 100 && detail.applyUrl?.startsWith("https://jobs.smartrecruiters.com/"));
  assert.deepEqual(parseFeed("greenhouse", { nonsense: true }), []);
  assert.deepEqual(parseFeed("lever", null), []);
});

test("HTML turns into readable text, including Greenhouse's escaped HTML", () => {
  assert.equal(htmlToText("<p>We sell <b>software</b> &amp; services.</p><ul><li>Find leads</li><li>Close deals</li></ul>"),
    "We sell software & services.\n\n• Find leads\n• Close deals");
  assert.equal(htmlToText("&lt;h2&gt;About&lt;/h2&gt;&lt;p&gt;Hello&amp;nbsp;world&lt;/p&gt;"), "About\n\nHello world");
  assert.ok(!/<|&lt;/.test(htmlToText(parseFeed("greenhouse", fixture("greenhouse"))[0].html ?? "")));
  assert.equal(htmlToText("<script>alert(1)</script>Hi"), "Hi");
});

test("places: cities, countries, remote and regions", () => {
  const r = (places: string[], countries: string[] = [], remote: boolean | null = null) => readPlaces({ places, countries, remote, hybrid: null });
  assert.deepEqual(r(["Ho Chi Minh City, Vietnam"]).cities, ["ho-chi-minh-city"]);
  assert.deepEqual(r(["HCMC"]).countries, ["VN"]);
  assert.deepEqual(r(["Singapore"]).countries, ["SG"]);
  assert.deepEqual(r(["Remote - APAC"]), { countries: [], cities: [], remote: true, hybrid: false, region: true });
  assert.deepEqual(r(["SF, NYC, CHI, ATL, SEA"]).countries, [], "SEA here is Seattle, not Southeast Asia");
  assert.deepEqual(r([], ["sg"]).countries, ["SG"]);
});

test("roles and levels from titles", () => {
  assert.deepEqual(guessRole("Senior SEO Specialist"), { role: "seo", category: "marketing" });
  assert.deepEqual(guessRole("Account Executive, Mid-Market"), { role: "account_executive", category: "sales" });
  assert.deepEqual(guessRole("Head of Marketing, APAC"), { role: "marketing_lead", category: "marketing" });
  assert.deepEqual(guessRole("Customer Support Specialist (Vietnamese)"), { role: "support", category: "customer_success" });
  assert.deepEqual(guessRole("Marketing Manager"), { role: null, category: "marketing" });
  assert.deepEqual(guessRole("Support Engineer"), { role: null, category: null });
  assert.deepEqual(guessRole("Growth Engineer"), { role: null, category: null });
  assert.deepEqual(guessRole("Contract Talent Acquisition Sourcer, Sales (APJ)"), { role: null, category: null });
  assert.deepEqual(guessRole("Senior Product Manager, AI Risk & Onboarding"), { role: null, category: null });
  assert.deepEqual(guessRole("AV Support Specialist"), { role: null, category: null });
  for (const t of ["Executive Assistant to CRO (SG Base)", "Senior Employer Brand & Employee Experience Specialist", "People Help Desk Analyst", "IT Operations Support Lead", "Team Lead - CDD Risk, Onboarding", "Associate Project Manager (Analytics), Customer Experience Group"]) {
    assert.deepEqual(guessRole(t), { role: null, category: null }, t);
  }
  assert.deepEqual(guessRole("Sales Development (Lead Generation) - SME & Growth, KL"), { role: "sdr", category: "sales" });
  assert.deepEqual(guessRole("Go-To-Market Partnerships Manager, SME & Growth"), { role: "partnerships", category: "sales" });
  assert.equal(guessSeniority("Sales Development (Lead Generation)", null), "mid");
  assert.deepEqual(guessRole("Product Marketing Manager"), { role: "product_marketing", category: "marketing" });
  assert.equal(guessSeniority("Senior SEO Specialist", null), "senior");
  assert.equal(guessSeniority("Marketing Intern", null), "intern");
  assert.equal(guessSeniority("Head of Sales", null), "director");
  assert.equal(guessSeniority("Content Marketer", "mid_senior_level"), "senior");
  assert.equal(mapEmployment("FullTime", "x"), "full_time");
  assert.equal(mapEmployment("fulltime_fixed_term", "x"), "full_time");
  assert.equal(mapEmployment("Contractor", "x"), "contract");
  assert.equal(mapEmployment(null, "Sales Intern"), "internship");
});

test("only our roles in our countries come in", () => {
  const base = { externalId: "1", applyUrl: "https://x.test/apply", postingUrl: "https://x.test", countries: [], remote: null, hybrid: null, employment: "Full-time", experience: null, html: "<p>Hi</p>", text: null, salary: null };
  const sg = toJob({ ...base, title: "Senior Account Executive", places: ["Singapore"] }, SEA);
  assert.ok("job" in sg && sg.job.workplace === "on_site" && sg.job.eligible_countries.join() === "SG" && sg.job.office_places.join() === "singapore-city");
  assert.deepEqual(toJob({ ...base, title: "Senior Account Executive", places: ["Dublin"] }, SEA), { skip: "place" });
  assert.deepEqual(toJob({ ...base, title: "Backend Engineer", places: ["Singapore"] }, SEA), { skip: "role" });
  const any = toJob({ ...base, title: "Backend Engineer", places: ["Singapore"] }, { ...SEA, niche_only: false });
  assert.ok("job" in any && any.job.category === "other");
  const apac = toJob({ ...base, title: "Content Marketer", places: ["Remote - APAC"] }, SEA);
  assert.ok("job" in apac && apac.job.workplace === "remote" && apac.job.eligible_countries.length === 6);
  assert.deepEqual(toJob({ ...base, title: "Content Marketer", places: ["Remote from the US"] }, SEA), { skip: "place" });
  assert.deepEqual(toJob({ ...base, title: "Content Marketer", places: ["Remote"] }, SEA), { skip: "place" }, "plain Remote could be anywhere");
  const paid = toJob({ ...base, title: "SDR", places: ["Kuala Lumpur"], salary: { min: 3000, max: 4500, currency: "myr", period: "month" } }, SEA);
  assert.ok("job" in paid && paid.job.salary_currency === "MYR" && paid.job.salary_period === "month");
  const real = parseFeed("lever", fixture("lever")).map((j) => toJob(j, { ...SEA, niche_only: false }));
  assert.ok(real.some((r) => "job" in r && r.job.workplace === "hybrid" && r.job.eligible_countries.includes("SG")));
});

test("imported job addresses are stable and valid", () => {
  const a = importedSlug("Senior SEO Lead", "Example Co", "greenhouse:ex:123");
  assert.equal(a, importedSlug("Senior SEO Lead", "Example Co", "greenhouse:ex:123"));
  assert.notEqual(a, importedSlug("Senior SEO Lead", "Example Co", "greenhouse:ex:124"));
  assert.match(a, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  const long = importedSlug("x ".repeat(80) + "Lead", "A Very Long Company Name That Goes On And On", "k1");
  assert.notEqual(long, importedSlug("x ".repeat(80) + "Lead", "A Very Long Company Name That Goes On And On", "k2"));
  assert.match(long, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.ok(long.length <= 100);
});

test("company names and further pages come from the feed", async () => {
  const { feedCompany, nextPageUrl } = await import("../src/lib/ats/boards.ts");
  assert.equal(feedCompany("greenhouse", fixture("greenhouse")), "Stripe");
  assert.equal(feedCompany("lever", fixture("lever")), null);
  assert.equal(nextPageUrl("smartrecruiters", "acme", { offset: 0, limit: 100, totalFound: 250 }), "https://api.smartrecruiters.com/v1/companies/acme/postings?limit=100&offset=100");
  assert.equal(nextPageUrl("smartrecruiters", "acme", { offset: 200, limit: 100, totalFound: 250 }), null);
  assert.equal(nextPageUrl("greenhouse", "acme", {}), null);
});
