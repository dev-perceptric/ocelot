// End-to-end on a real local Supabase: saving Ocelot jobs, "Did you apply?", adding outside jobs,
// moving cards (menu and drag and drop), notes, contacts, archive and delete.
// Run like tests/e2e/team.cjs (see "End-to-end tests" in docs/setup.md).
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const APP = "http://localhost:3100", MAIL = "http://127.0.0.1:54324";
const sql = (q) => execSync(`psql postgres://postgres:postgres@127.0.0.1:54322/postgres -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (cond, what) => { console.log(`${cond ? "ok  " : "FAIL"} ${what}`); if (!cond) process.exitCode = 1; };

async function code(email, after) {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent("to:" + email)}`)).json();
    const m = (list.messages ?? []).find((x) => new Date(x.Created) > after);
    if (m) {
      const full = await (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json();
      const c = (full.Text || full.HTML).match(/\b(\d{6})\b/);
      if (c) return c[1];
    }
    await sleep(500);
  }
  throw new Error("no code email for " + email);
}
async function login(page, email, intent) {
  await page.goto(`${APP}/login`);
  const at = new Date(Date.now() - 1000);
  await page.fill("#email", email);
  await page.click("button[type=submit]");
  await page.waitForSelector("#code");
  await page.fill("#code", await code(email, at));
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  if (page.url().includes("/welcome")) {
    await page.getByText(intent).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/welcome"));
  }
}
const stage = (title) => sql(`select stage from tracker_items where title = '${title}'`);

(async () => {
  sql("insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'boss@gamma.test')");
  const org = sql("insert into orgs (name, slug) values ('Gamma Growth', 'gamma-growth') returning id").split("\n")[0];
  sql(`insert into org_members (org_id, user_id, role) values ('${org}', '00000000-0000-0000-0000-0000000000e1', 'owner')`);
  sql(`insert into jobs (org_id, slug, title, workplace, office_places, eligible_countries, description, status, published_at, expires_at, apply_method, apply_url)
       values ('${org}', 'gamma-growth-lead', 'Growth Lead', 'hybrid', '{hanoi}', '{VN}', 'Lead growth.', 'published', now(), now() + interval '30 days', 'external', '${APP}/terms')`);

  const b = await chromium.launch();
  const ctx = await b.newContext();
  const errors = [];
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await login(p, "linh@mail.test", "Find a job");
  ok(await p.isVisible("text=Your next move starts here."), "an empty tracker shows its first screen");

  // Save from the job page.
  await p.goto(`${APP}/jobs/gamma-growth-lead`);
  await p.getByRole("button", { name: "Save job" }).click();
  await p.waitForSelector("text=Saved in My search");
  ok(stage("Growth Lead") === "saved" && sql("select location from tracker_items where title = 'Growth Lead'") === "Hybrid, Hanoi", "Save job makes a Saved card with the listing's details");

  // Apply on the company site: the click alone changes nothing; "Not yet" keeps it Saved; "Yes" moves it.
  const [tab1] = await Promise.all([ctx.waitForEvent("page"), p.getByRole("link", { name: "Apply on company site" }).click()]);
  await tab1.close();
  await p.waitForSelector("text=Did you apply to Growth Lead?");
  ok(stage("Growth Lead") === "saved", "opening the company's page alone doesn't mark it Applied");
  await p.getByRole("button", { name: "Not yet" }).click();
  ok(stage("Growth Lead") === "saved", "Not yet keeps it Saved");
  const [tab2] = await Promise.all([ctx.waitForEvent("page"), p.getByRole("link", { name: "Apply on company site" }).click()]);
  await tab2.close();
  await p.getByRole("button", { name: "Yes, I applied" }).click();
  await p.waitForSelector("text=Moved to Applied in My search");
  ok(stage("Growth Lead") === "applied" && sql("select applied_at is not null from tracker_items where title = 'Growth Lead'") === "t", "Yes moves it to Applied");

  // Add a job found elsewhere.
  await p.goto(`${APP}/app/tracker`);
  await p.getByRole("button", { name: "Add a job" }).first().click();
  await p.fill("#card-title", "Brand Manager");
  await p.fill("#card-company", "Elsewhere Co");
  await p.fill("#card-url", "elsewhere.test/jobs/42");
  await p.locator("dialog").getByRole("button", { name: "Add job" }).click();
  await p.waitForURL(/\/app\/tracker\/[0-9a-f-]{36}$/);
  ok(sql("select url from tracker_items where title = 'Brand Manager'") === "https://elsewhere.test/jobs/42", "an outside job is added with its link");

  // Notes save on their own; contacts and details save.
  await p.fill("#notes", "Referral from Minh. Ask about team size.");
  await sleep(1800);
  ok(sql("select notes from tracker_items where title = 'Brand Manager'") === "Referral from Minh. Ask about team size.", "notes save a moment after typing stops");
  await p.getByRole("button", { name: "Add a contact" }).click();
  await p.fill("#c-0-name", "Minh Tran"); await p.fill("#c-0-email", "minh@elsewhere.test");
  await p.getByRole("button", { name: "Save contacts" }).click();
  await p.waitForSelector("text=Contacts saved");
  ok(sql("select contacts->0->>'name' from tracker_items where title = 'Brand Manager'") === "Minh Tran", "contacts save");
  await p.fill("#d-salary", "USD 2,000 / month");
  await p.getByRole("button", { name: "Save details" }).click();
  await p.waitForSelector("text=Saved");
  ok(sql("select salary from tracker_items where title = 'Brand Manager'") === "USD 2,000 / month", "details save");

  // Move cards: with the menu, and by dragging.
  await p.goto(`${APP}/app/tracker`);
  await p.getByRole("button", { name: "Move Brand Manager" }).click();
  await p.getByRole("menuitem", { name: "Move to Applied" }).click();
  await p.waitForSelector("text=Moved to Applied");
  ok(stage("Brand Manager") === "applied", "a card moves with its menu");
  await p.locator("article", { hasText: "Growth Lead" }).dragTo(p.locator("section[aria-label^='Interviewing']"));
  await sleep(1200);
  ok(stage("Growth Lead") === "interviewing", "a card moves by drag and drop");
  ok(sql("select count(*) from tracker_events where kind = 'stage'") >= "3", "every move is in the card's history");
  await p.screenshot({ path: (process.argv[2] ?? require("os").tmpdir()) + "/e2e-board.png", fullPage: true });

  await p.goto(`${APP}/app/tracker?view=list`);
  ok(await p.isVisible("td >> text=Brand Manager") && await p.isVisible("td >> text=Growth Lead"), "list view shows the same jobs");

  // The job page knows it's tracked.
  await p.goto(`${APP}/jobs/gamma-growth-lead`);
  ok(await p.isVisible("text=Interviewing in My search"), "the job page shows the card's stage");

  // Archive, then delete.
  await p.goto(`${APP}/app/tracker`);
  await p.getByRole("link", { name: "Brand Manager" }).click();
  await p.getByRole("button", { name: "Archive" }).click();
  await p.waitForSelector("text=Archived");
  await p.goto(`${APP}/app/tracker?show=closed`);
  ok(await p.isVisible("text=Brand Manager"), "archived jobs show under Closed");
  await p.getByRole("link", { name: "Brand Manager" }).click();
  await p.getByRole("button", { name: "Delete" }).click();
  await p.locator("dialog").getByRole("button", { name: "Delete" }).click();
  await p.waitForURL(/\/app\/tracker$/);
  ok(sql("select count(*) from tracker_items where title = 'Brand Manager'") === "0", "a card can be deleted");

  // Phone: no sideways scrolling on the board.
  const m = await (await b.newContext({ viewport: { width: 390, height: 800 }, storageState: await ctx.storageState() })).newPage();
  await m.goto(`${APP}/app/tracker`);
  ok(!(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "phone: the board fits the screen");

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.error("CRASH", e.message); process.exit(1); });
