// End-to-end on a real local Supabase: job search, filters, chips, paging and the phone filter sheet.
// Run like tests/e2e/team.cjs (see "End-to-end tests" in docs/setup.md).
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const APP = "http://localhost:3100";
const sql = (q) => execSync(`psql postgres://postgres:postgres@127.0.0.1:54322/postgres -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const ok = (cond, what) => { console.log(`${cond ? "ok  " : "FAIL"} ${what}`); if (!cond) process.exitCode = 1; };

// Seed: one company, 25 live jobs of different kinds, plus a closed and a draft job.
sql("insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'seed@delta.test')");
const org = sql("insert into orgs (name, slug) values ('Delta Analytics', 'delta-analytics') returning id").split("\n")[0];
sql(`insert into org_members (org_id, user_id, role) values ('${org}', '00000000-0000-0000-0000-0000000000e1', 'owner')`);
const kinds = [
  ["SEO Specialist", "seo", "marketing", "remote", "{}", "{VN,SG}", "1200", "mid", "full_time"],
  ["Account Executive", "account_executive", "sales", "hybrid", "{hanoi}", "{VN}", null, "senior", "full_time"],
  ["Customer Success Manager", "cs_manager", "customer_success", "on_site", "{singapore-city}", "{SG}", null, "mid", "contract"],
];
for (let i = 0; i < 25; i++) {
  const [t, role, cat, wp, offices, countries, pay, level, type] = kinds[i % 3];
  sql(`insert into jobs (org_id, slug, title, role, category, workplace, office_places, eligible_countries, salary_min, salary_currency, salary_period, seniority, employment_type, description, status, published_at, expires_at)
       values ('${org}', 'seed-${i}', '${t} ${i}', '${role}', '${cat}', '${wp}', '${offices}', '${countries}', ${pay ?? "null"}, ${pay ? "'USD'" : "null"}, ${pay ? "'month'" : "null"}, '${level}', '${type}', 'Seeded role number ${i}.', 'published', now() - interval '${i} hours', now() + interval '20 days')`);
}
sql(`insert into jobs (org_id, slug, title, status, published_at, workplace, eligible_countries) values ('${org}', 'seed-closed', 'Closed Role', 'closed', now(), 'remote', '{VN}')`);
sql(`insert into jobs (org_id, slug, title) values ('${org}', 'seed-draft', 'Draft Role')`);
sql(`update jobs set featured_until = now() + interval '3 days' where slug = 'seed-24'`);

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const p = await (await b.newContext()).newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  const count = async () => (await p.textContent("[role=status]")).trim();
  const titles = async () => p.locator("h3").allTextContents();

  await p.goto(`${APP}/jobs`);
  ok(await count() === "25 jobs", "all live jobs counted; closed and draft jobs left out");
  ok((await titles()).length === 20, "20 jobs per page");
  ok((await titles())[0].startsWith("SEO Specialist 24") || (await titles())[0].includes("24"), "the promoted job comes first");
  ok(await p.isVisible("text=Promoted listing"), "the promoted job is labeled");
  await p.getByRole("link", { name: "Next" }).click();
  await p.waitForURL(/page=2/);
  ok((await titles()).length === 5, "page 2 has the rest");

  await p.goto(`${APP}/jobs`);
  await p.getByRole("checkbox", { name: "Remote" }).check();
  await p.waitForURL(/where=remote/);
  await p.waitForSelector("text=9 jobs");
  ok(await count() === "9 jobs", "Remote filter");
  await p.click("#f-country"); await p.keyboard.type("Singa"); await p.keyboard.press("Enter");
  await p.waitForURL(/country=SG/);
  ok(await count() === "9 jobs" && (await titles()).every((t) => t.startsWith("SEO")), "country filter keeps remote jobs open to Singapore");
  await p.getByRole("checkbox", { name: "Remote" }).uncheck();
  await p.waitForURL((u) => !u.search.includes("where="));
  await p.waitForSelector("text=17 jobs");
  ok(await count() === "17 jobs", "Singapore: remote SEO jobs plus on-site Singapore jobs");
  await p.click("#f-area"); await p.keyboard.type("Customer success manager"); await p.keyboard.press("Enter");
  await p.waitForURL(/role=cs_manager/);
  ok(await count() === "8 jobs", "area filter by role");
  ok(await p.isVisible("text=Hiring in Singapore") && await p.isVisible("a[aria-label='Remove filter Customer success manager']"), "active filters show as removable tags");
  await p.click("a[aria-label='Remove filter Hiring in Singapore']");
  await p.waitForURL((u) => !u.search.includes("country="));
  ok(await count() === "8 jobs", "removing a tag removes that filter");

  await p.goto(`${APP}/jobs?q=delta`);
  ok(await count() === "25 jobs", "search matches the company name");
  await p.goto(`${APP}/jobs?q=account+executive&pay=1`);
  ok(await count() === "0 jobs" && await p.isVisible("text=No jobs match."), "no-match message");
  await p.goto(`${APP}/jobs?q=seo&level=mid`);
  ok(await count() === "9 jobs", "keyword plus seniority");
  const robots = await p.getAttribute("meta[name=robots]", "content");
  ok(/noindex/.test(robots ?? ""), "filtered pages aren't indexed");

  // Phone: filters in a sheet; Select works inside it.
  const m = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  m.on("pageerror", (e) => errors.push(e.message));
  await m.goto(`${APP}/jobs`);
  ok(!(await m.isVisible("aside[aria-label=Filters]")), "phone: filters start hidden");
  await m.getByRole("button", { name: "Filters" }).click();
  await m.locator("[role=dialog] #f-country").click(); await m.keyboard.type("Vietnam"); await m.keyboard.press("Enter");
  await m.waitForURL(/country=VN/);
  await m.locator("[role=dialog]").getByRole("button", { name: /Show \d+ jobs/ }).click();
  ok(!(await m.isVisible("[role=dialog]")) && (await m.textContent("[role=status]")).trim() === "17 jobs", "phone: the sheet filters and closes");
  ok(!(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "phone: no sideways scrolling");
  await m.screenshot({ path: (process.argv[2] ?? require("os").tmpdir()) + "/e2e-search-phone.png" });
  await p.goto(`${APP}/jobs?where=remote,hybrid&role=seo`);
  await p.screenshot({ path: (process.argv[2] ?? require("os").tmpdir()) + "/e2e-search.png", fullPage: true });

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.error("CRASH", e.message); process.exit(1); });
