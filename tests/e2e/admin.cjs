// End-to-end on a real local Supabase: the admin area. Ben has a company with a live job; Vi is an admin.
// Run the same way as tests/e2e/team.cjs (see "End-to-end tests" in docs/setup.md).
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
  if (intent && page.url().includes("/welcome")) {
    await page.getByText(intent).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/welcome"));
  }
}

// Opens an askText dialog with `button`, types `text`, confirms with `confirm`.
const ask = async (page, button, label, text, confirm = button) => {
  await page.getByRole("button", { name: button }).click();
  await page.getByLabel(label).fill(text);
  await page.locator("dialog").getByRole("button", { name: confirm, exact: true }).click();
};

(async () => {
  const b = await chromium.launch();
  const errors = [];

  // Ben: a company with one live job.
  const ben = await (await b.newContext()).newPage();
  await login(ben, "ben@beta.test", "Hire for my company");
  await ben.fill("#name", "Beta Hiring");
  await ben.getByRole("button", { name: "Create company" }).click();
  await ben.waitForSelector("text=Beta Hiring");
  const org = sql("select id from orgs where name = 'Beta Hiring'");
  sql(`insert into jobs (org_id, slug, title, status, published_at, expires_at) values ('${org}', 'beta-sdr', 'Sales Development Rep', 'published', now(), now() + interval '30 days')`);
  sql(`update orgs set slug = 'beta-hiring' where id = '${org}'`);
  ok((await fetch(`${APP}/jobs/beta-sdr`)).status === 200, "Ben's live job is public");

  // A non-admin gets a plain 404 at /admin.
  const r = await ben.goto(`${APP}/admin`);
  ok(r.status() === 404, "a non-admin gets 404 at /admin");

  // Vi becomes an admin.
  const vi = await (await b.newContext()).newPage();
  vi.on("pageerror", (e) => errors.push(e.message));
  await login(vi, "vi@ocelot.test", "Hire for my company");
  sql("insert into platform_admins select id from auth.users where email = 'vi@ocelot.test'");
  await vi.goto(`${APP}/admin`);
  ok(await vi.isVisible("text=Live jobs"), "admin overview loads");
  ok((await vi.locator("dt:has-text('Companies') + dd").textContent()) === "1", "overview counts companies");

  // Companies: search, open, verify with a note, suspend with a reason.
  await vi.goto(`${APP}/admin/companies?q=beta`);
  await vi.getByRole("link", { name: "Beta Hiring" }).click();
  await vi.waitForURL(/\/admin\/companies\/[0-9a-f-]{36}$/);
  await ask(vi, "Mark Company verified", "What did you check?", "Business registration 0312345678", "Mark verified");
  await vi.waitForSelector("text=Marked Company verified");
  await vi.reload();
  ok(await vi.isVisible("text=Business registration 0312345678"), "verify note is shown");
  ok(sql(`select business_verified_at is not null from orgs where id = '${org}'`) === "t", "company is verified");

  await ask(vi, "Suspend company", "Reason (kept in the audit log)", "Asked candidates for a fee");
  await vi.waitForSelector("text=Company suspended");
  ok((await fetch(`${APP}/jobs/beta-sdr`)).status === 404, "a suspended company's job page is gone");
  const jobsPage = await (await fetch(`${APP}/jobs`)).text();
  ok(!jobsPage.includes("Sales Development Rep"), "a suspended company's job leaves the job list");
  await ben.goto(`${APP}/employer`);
  ok(await ben.isVisible("text=Sales Development Rep"), "Ben still sees his own job while suspended");

  await vi.reload();
  await vi.getByRole("button", { name: "Lift suspension" }).click();
  await vi.locator("dialog").getByRole("button", { name: "Lift suspension" }).click();
  await vi.waitForSelector("text=Suspension lifted");
  ok((await fetch(`${APP}/jobs/beta-sdr`)).status === 200, "lifting the suspension brings the job back");

  // People: suspend Ben's sign-in, then lift it.
  await vi.goto(`${APP}/admin/people?q=ben`);
  await vi.getByRole("link", { name: "ben@beta.test" }).click();
  await ask(vi, "Suspend sign-in", "Reason (kept in the audit log)", "Spam");
  await vi.waitForSelector("text=Sign-in suspended");
  const ben2 = await (await b.newContext()).newPage();
  await ben2.goto(`${APP}/login`);
  await ben2.fill("#email", "ben@beta.test");
  await ben2.click("button[type=submit]");
  await ben2.waitForTimeout(1500);
  const blocked = (await ben2.isVisible("#email-error")) || !(await ben2.isVisible("#code"));
  let banned = blocked;
  if (!blocked) {
    // Some versions still send the email; then the code must be refused.
    await ben2.fill("#code", await code("ben@beta.test", new Date(Date.now() - 5000)));
    await ben2.click("button[type=submit]");
    await ben2.waitForTimeout(1500);
    banned = await ben2.isVisible("#code-error");
  }
  ok(banned, "a suspended person can't sign in");
  await vi.reload();
  await vi.getByRole("button", { name: "Lift suspension" }).click();
  await vi.locator("dialog").getByRole("button", { name: "Lift suspension" }).click();
  await vi.waitForSelector("text=They can sign in again");
  await vi.reload();
  ok(!(await vi.isVisible("text=Sign-in suspended")) && (await vi.isVisible("button:has-text('Suspend sign-in')")), "suspension lifted");
  const meId = sql("select id from auth.users where email = 'vi@ocelot.test'");
  await vi.goto(`${APP}/admin/people/${meId}`);
  ok(!(await vi.isVisible("button:has-text('Suspend sign-in')")), "an admin can't suspend themself");

  // Queue: a failed task can be retried.
  sql("insert into jobs_queue (kind, payload, attempts, error, done_at) values ('email', jsonb_build_object('to', 'x@bad', 'kind', 'team_invite'), 1, 'resend 422 invalid', now())");
  await vi.goto(`${APP}/admin/queue`);
  ok(await vi.isVisible("text=resend 422 invalid"), "failed task is listed");
  await vi.getByRole("button", { name: "Retry" }).click();
  await vi.waitForSelector("text=Queued again");
  ok(sql("select count(*) from jobs_queue where error is null and done_at is null and payload->>'to' = 'x@bad'") === "1", "retry puts the task back on the queue");

  // Audit log has every action, with who did it.
  await vi.goto(`${APP}/admin/audit`);
  for (const a of ["company.verify", "company.suspend", "company.unsuspend", "person.suspend", "person.unsuspend", "queue.retry"]) {
    ok(await vi.isVisible(`text=${a}`), `audit log shows ${a}`);
  }
  ok(await vi.isVisible("text=vi@ocelot.test"), "audit log shows who did it");
  await vi.screenshot({ path: (process.argv[2] ?? require("os").tmpdir()) + "/e2e-audit.png", fullPage: true });

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.error("CRASH", e.message); process.exit(1); });
