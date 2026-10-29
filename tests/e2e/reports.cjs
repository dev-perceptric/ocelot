// End-to-end on a real local Supabase: reporting a job (visitor and signed in), limits, and handling reports.
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
async function report(page, reason, details, email) {
  await page.getByRole("button", { name: "Report this job" }).click();
  await page.getByLabel(reason).check();
  if (details) await page.fill("#report-details", details);
  if (email) await page.fill("#report-email", email);
  await page.getByRole("button", { name: "Send report" }).click();
  await page.waitForSelector(":text(\"Thanks for telling us\"), dialog [role=alert]");
}

(async () => {
  const b = await chromium.launch();
  const errors = [];

  // Vi is an admin; a company has one live job.
  const vi = await (await b.newContext()).newPage();
  vi.on("pageerror", (e) => errors.push(e.message));
  await login(vi, "vi@ocelot.test", "Hire for my company");
  sql("insert into platform_admins select id from auth.users where email = 'vi@ocelot.test' on conflict do nothing");
  sql("insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'boss@shady.test')");
  const org = sql("insert into orgs (name, slug) values ('Shady Jobs', 'shady-jobs') returning id").split("\n")[0];
  sql(`insert into org_members (org_id, user_id, role) values ('${org}', '00000000-0000-0000-0000-0000000000e1', 'owner')`);
  sql(`insert into jobs (org_id, slug, title, workplace, eligible_countries, description, status, published_at, expires_at) values ('${org}', 'shady-sales', 'Easy Sales Job', 'remote', '{VN}', 'Pay 500k VND for training, then earn big.', 'published', now(), now() + interval '30 days')`);

  // A visitor reports it.
  const visitor = await (await b.newContext()).newPage();
  visitor.on("pageerror", (e) => errors.push(e.message));
  await visitor.goto(`${APP}/jobs/shady-sales`);
  await report(visitor, "Asks candidates to pay", "They want 500k VND for training.", "tipster@mail.test");
  ok(await visitor.isVisible("text=Never pay a company to apply"), "a visitor can report and gets a safety tip");
  ok(sql("select count(*) from reports where reporter_id is null and contact_email = 'tipster@mail.test' and reason = 'fee_required'") === "1", "the visitor's report is saved with their contact email");
  ok(sql("select count(*) from jobs_queue where payload->>'kind' = 'report_received' and payload->>'to' = 'vi@ocelot.test'") === "1", "admins get an email about the report");

  // Visitors are limited.
  for (let i = 0; i < 4; i++) { await visitor.reload(); await report(visitor, "Scam or fake job"); }
  await visitor.reload(); await report(visitor, "Scam or fake job");
  ok(await visitor.isVisible("text=Too many reports right now"), "a visitor can't flood reports");

  // Dee reports while signed in; reporting twice doesn't pile up.
  const dee = await (await b.newContext()).newPage();
  await login(dee, "dee@mail.test", "Find a job");
  await dee.goto(`${APP}/jobs/shady-sales`);
  ok(!(await dee.locator("#report-email").count()), "signed-in reporters aren't asked for an email");
  await report(dee, "Scam or fake job", "Classic training-fee scam.");
  await dee.reload(); await report(dee, "Scam or fake job");
  ok(sql("select count(*) from reports where reporter_id = (select id from auth.users where email = 'dee@mail.test')") === "1", "one open report per person per job");

  // Vi handles them.
  await vi.goto(`${APP}/admin/reports`);
  ok(await vi.isVisible("text=They want 500k VND for training.") && await vi.isVisible("text=Visitor, tipster@mail.test") && await vi.isVisible("text=dee@mail.test"), "admin sees reports with details and who sent them");
  await vi.getByRole("row", { name: /They want 500k VND/ }).getByRole("button", { name: "Actioned" }).click();
  await vi.getByLabel("Note (kept in the audit log)").fill("Suspended the company: training fee.");
  await vi.locator("dialog").getByRole("button", { name: "Mark actioned" }).click();
  await vi.waitForSelector("text=Marked actioned");
  ok(sql("select status from reports where contact_email = 'tipster@mail.test'") === "actioned", "a report can be marked actioned");
  await vi.reload();
  await vi.getByRole("row", { name: /Classic training-fee scam/ }).getByRole("button", { name: "Dismiss" }).click();
  await vi.locator("dialog").getByRole("button", { name: "Dismiss" }).click();
  await vi.waitForSelector("text=Dismissed");
  await vi.goto(`${APP}/admin/reports?tab=handled`);
  ok(await vi.isVisible("text=Suspended the company: training fee."), "handled reports keep the admin's note");
  ok(sql("select count(*) from audit_events where action like 'report.%'") === "2", "report decisions are in the audit log");
  await vi.screenshot({ path: (process.argv[2] ?? require("os").tmpdir()) + "/e2e-reports.png", fullPage: true });

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.error("CRASH", e.message); process.exit(1); });
