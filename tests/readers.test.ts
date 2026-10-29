import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { boardHome, jobFromPage, parseMoreLink, READERS, workdayParts, type Get, type MoreProvider } from "../src/lib/ats/readers.ts";

const fx = (f: string) => readFileSync(new URL(`fixtures/ats/more/${f}`, import.meta.url), "utf8");
const json = (f: string) => JSON.parse(fx(f));
// A stand-in for the internet: each address pattern answers with a saved page from the real board.
const fake = (routes: [RegExp, () => unknown][]): Get => async (url) => {
  const hit = routes.find(([re]) => re.test(url));
  if (!hit) throw new Error(`no route for ${url}`);
  return hit[1]();
};
const all = { wanted: () => true };

const cases: [MoreProvider, string, [RegExp, () => unknown][]][] = [
  ["workday", "salesforce.wd12.External_Career_Site", [[/\/jobs$/, () => json("workday-list.json")], [/\/job\//, () => json("workday-job.json")]]],
  ["bamboohr", "womensbeanproject", [[/\/careers\/list$/, () => json("bamboohr-list.json")], [/\/detail$/, () => json("bamboohr-job.json")], [/\/careers$/, () => "<title>Careers | Women's Bean Project</title>"]]],
  ["breezy", "socradar", [[/\/json$/, () => json("breezy-list.json")], [/\/p\//, () => fx("breezy-job.html")]]],
  ["rippling", "15-lightyears-careers", [[/\/jobs$/, () => json("rippling-list.json")], [/\/jobs\/[0-9a-f-]+$/, () => json("rippling-job.json")]]],
  ["pinpoint", "accenture", [[/postings\.json$/, () => json("pinpoint-list.json")]]],
  ["teamtailor", "stillfrontgroup", [[/jobs\.rss$/, () => fx("teamtailor.rss")]]],
  ["personio", "flexa", [[/\/xml$/, () => fx("personio.xml")]]],
  ["jobvite", "laserfiche", [[/\/jobs$/, () => fx("jobvite-list.html")], [/\/job\//, () => fx("jobvite-job.html")]]],
  ["jazzhr", "centimark", [[/\/apply$/, () => fx("jazzhr-list.html")], [/\/apply\/[A-Za-z0-9]+\//, () => fx("jazzhr-job.html")]]],
  ["icims", "careers-cadmusgroup.icims.com", [[/\/jobs\/search/, () => fx("icims-list.html")], [/\/job\?in_iframe/, () => fx("icims-job.html")]]],
];

for (const [p, board, routes] of cases) {
  test(`${p}: jobs with a title, link, text and place, and the company`, async () => {
    const { jobs, company } = await READERS[p](board, { get: fake(routes), ...all });
    assert.ok(jobs.length > 0, "some jobs");
    for (const j of jobs) {
      assert.ok(j.externalId && j.title && /^https:\/\//.test(j.applyUrl), JSON.stringify(j).slice(0, 200));
      assert.ok(j.places.length || j.remote, `a place for ${j.title}`);
    }
    assert.ok(jobs.some((j) => (j.html ?? "").length > 20), "the text of the job");
    assert.ok(company && company.length > 1, "a company name");
    assert.match(boardHome(p, board) ?? "", /^https:\/\//);
  });
}

test("only wanted titles are opened", async () => {
  let opened = 0;
  const get: Get = async (url) => { if (/\/job\//.test(url)) { opened++; return json("workday-job.json"); } return json("workday-list.json"); };
  const { jobs } = await READERS.workday("salesforce.wd12.External_Career_Site", { get, wanted: (t) => /account executive/i.test(t) });
  assert.ok(jobs.length >= 1 && opened === jobs.length);
});

test("board links for the new boards", () => {
  const cases: [string, string, string][] = [
    ["https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site/job/x", "workday", "salesforce.wd12.External_Career_Site"],
    ["https://acme.bamboohr.com/careers/12", "bamboohr", "acme"], ["https://acme.breezy.hr/p/1", "breezy", "acme"],
    ["https://ats.rippling.com/acme/jobs/1", "rippling", "acme"], ["https://acme.pinpointhq.com/en/postings/1", "pinpoint", "acme"],
    ["https://acme.teamtailor.com/jobs", "teamtailor", "acme"], ["https://acme.jobs.personio.de/job/1", "personio", "acme"],
    ["https://jobs.jobvite.com/acme/job/x", "jobvite", "acme"], ["https://acme.applytojob.com/apply/x", "jazzhr", "acme"],
    ["https://careers-acme.icims.com/jobs/1/x/job", "icims", "careers-acme.icims.com"],
  ];
  for (const [link, provider, board] of cases) assert.deepEqual(parseMoreLink(new URL(link)), { provider, board }, link);
  assert.equal(workdayParts("salesforce.wd12")?.site, undefined);
});

test("JobPosting data: text, places, remote, pay and company", () => {
  const html = `<script type="application/ld+json">{"@context":"http://schema.org","@type":"JobPosting","title":"Account Executive","description":"&lt;p&gt;Sell&lt;/p&gt;",
    "hiringOrganization":{"name":"Acme"},"jobLocation":[{"address":{"addressLocality":"Austin","addressRegion":"TX","addressCountry":"US"}}],"jobLocationType":"TELECOMMUTE",
    "baseSalary":{"currency":"USD","value":{"minValue":90000,"maxValue":120000,"unitText":"YEAR"}}}</script>`;
  const p = jobFromPage(html)!;
  assert.deepEqual([p.title, p.company, p.html, p.places, p.countries, p.remote], ["Account Executive", "Acme", "<p>Sell</p>", ["Austin, TX, US"], ["US"], true]);
  assert.deepEqual(p.salary, { min: 90000, max: 120000, currency: "USD", period: "year" });
  assert.equal(jobFromPage("<html>no data</html>"), null);
});
