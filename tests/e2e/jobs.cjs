// End-to-end on a real local Supabase: post a job, review (send back, then publish), edit a live job, close,
// duplicate and delete. Run like tests/e2e/team.cjs (see "End-to-end tests" in docs/setup.md).
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const APP = "http://localhost:3100", MAIL = "http://127.0.0.1:54324";
const sql = (q) => execSync(`psql postgres://postgres:postgres@127.0.0.1:54322/postgres -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (cond, what) => { console.log(`${cond ? "ok  " : "FAIL"} ${what}`); if (!cond) process.exitCode = 1; };
const status = (slug) => sql(`select status from jobs where slug like '${slug}%' order by created_at limit 1`);

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
async function pick(page, id, text) {
  await page.click(`#${id}`);
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
  if (await page.locator(`#${id}[aria-expanded=true]`).count()) await page.keyboard.press("Escape");
}

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const hanh = await (await b.newContext()).newPage();
  hanh.on("pageerror", (e) => errors.push(e.message));
  await login(hanh, "hanh@gamma.test", "Hire for my company");
  await hanh.fill("#name", "Gamma Growth"); await hanh.getByRole("button", { name: "Create company" }).click(); await hanh.waitForSelector("h1:has-text('Gamma Growth')");

  // An incomplete job saves as a draft and says what's missing.
  await hanh.goto(`${APP}/employer/jobs`);
  await hanh.getByRole("link", { name: "Post a job" }).click();
  await hanh.fill("#title", "Growth Marketer");
  await hanh.getByRole("button", { name: "Send for review" }).click();
  await hanh.waitForURL(/\/employer\/jobs\/[0-9a-f-]{36}\?missing=/);
  ok(await hanh.isVisible("text=Saved as a draft. Choose a role."), "an incomplete job is saved as a draft with what's missing");
  ok(status("growth-marketer") === "draft", "it stays a draft");

  // Fill it in and send it.
  await pick(hanh, "role", "Growth");
  await pick(hanh, "seniority", "Mid");
  await hanh.getByText("Hybrid", { exact: true }).click();
  await pick(hanh, "office_places", "Ho Chi");
  await hanh.fill("#salary_min", "1500"); await hanh.fill("#salary_max", "2500");
  await hanh.fill("#description", "Own paid and organic growth for our B2B product in Vietnam. ".repeat(5));
  await hanh.fill("#apply_url", "gamma.test/careers/growth");
  await hanh.getByRole("button", { name: "Send for review" }).click();
  await hanh.waitForSelector("text=Sent for review");
  ok(status("growth-marketer") === "pending_review", "a complete job goes to review");
  const slug = sql("select slug from jobs where title = 'Growth Marketer'");
  ok((await fetch(`${APP}/jobs/${slug}`)).status === 404, "a job under review isn't public");
  await hanh.getByRole("link", { name: "Preview" }).click();
  await hanh.waitForSelector("text=how candidates will see the job");
  ok(await hanh.isVisible("text=USD 1,500-2,500 / month") && await hanh.isVisible("text=Hybrid, Ho Chi Minh City"), "preview shows the job as candidates will see it");
  await hanh.screenshot({ path: (process.argv[2] ?? require("os").tmpdir()) + "/e2e-preview.png", fullPage: true });

  // Vi (admin) sends it back with a note.
  const vi = await (await b.newContext()).newPage();
  vi.on("pageerror", (e) => errors.push(e.message));
  await login(vi, "vi@ocelot.test", "Hire for my company");
  sql("insert into platform_admins select id from auth.users where email = 'vi@ocelot.test' on conflict do nothing");
  await vi.goto(`${APP}/admin/review`);
  await vi.getByRole("link", { name: "Growth Marketer" }).click();
  await vi.getByRole("button", { name: "Send back" }).click();
  await vi.getByLabel("What needs to change (the company sees this)").fill("Add the countries you can hire from beyond Vietnam, if any.");
  await vi.locator("dialog").getByRole("button", { name: "Send back", exact: true }).click();
  await vi.waitForURL(/\/admin\/review$/);
  ok(status("growth-marketer") === "rejected", "sent back");
  ok(sql("select count(*) from jobs_queue where payload->>'kind' = 'job_sent_back' and payload->>'to' = 'hanh@gamma.test'") === "1", "the company gets a 'needs an update' email");
  await hanh.goto(`${APP}/employer/jobs`);
  ok(await hanh.isVisible("text=Needs an update"), "the jobs list shows Needs an update");
  await hanh.getByRole("link", { name: "Growth Marketer" }).click();
  await hanh.waitForSelector("text=needs an update before it can go live", { timeout: 10000 }).catch(() => {});
  ok(await hanh.isVisible("text=Add the countries you can hire from beyond Vietnam"), "the job page shows the reviewer's note");

  // Hanh fixes it; Vi publishes.
  await pick(hanh, "eligible_countries", "Singapore");
  await hanh.getByRole("button", { name: "Send for review" }).click();
  await hanh.waitForSelector("text=Sent for review");
  await vi.goto(`${APP}/admin/review`);
  await vi.getByRole("link", { name: "Growth Marketer" }).click();
  await vi.getByRole("button", { name: "Publish" }).click();
  await vi.locator("dialog").getByRole("button", { name: "Publish", exact: true }).click();
  await vi.waitForURL(/\/admin\/review$/);
  ok(status("growth-marketer") === "published", "published");
  ok(sql("select count(*) from jobs_queue where payload->>'kind' = 'job_published'") === "1", "the company gets a 'job is live' email");
  const page = await (await fetch(`${APP}/jobs/${slug}`)).text();
  ok(page.includes("Growth Marketer") && page.includes('"@type":"JobPosting"'), "the live job page has Google job data");
  ok(page.includes("Remote") === false && page.includes("Hybrid, Ho Chi Minh City"), "the page shows where the job is");
  ok((await (await fetch(`${APP}/jobs`)).text()).includes("Growth Marketer"), "the job shows in the job list");
  ok(sql("select count(*) from audit_events where action in ('job.publish', 'job.send_back')") === "2", "both review decisions are in the audit log");

  // Editing a live job sends it back to review.
  await hanh.goto(`${APP}/employer/jobs`);
  await hanh.getByRole("link", { name: "Growth Marketer" }).click();
  await hanh.waitForSelector("text=Changes go to review", { timeout: 10000 }).catch(() => {});
  ok(await hanh.isVisible("text=Changes go to review before candidates see them."), "editing a live job warns about review");
  await hanh.fill("#title", "Senior Growth Marketer");
  await hanh.getByRole("button", { name: "Save changes" }).click();
  await hanh.waitForSelector("text=Job saved");
  ok(status("growth-marketer") === "pending_review", "the edit sent the job back to review");
  ok((await fetch(`${APP}/jobs/${slug}`)).status === 404, "and it left the public site until approved");
  sql(`select publish_job(id) from jobs where slug = '${slug}'`);

  // Close, duplicate, delete.
  await hanh.reload();
  await hanh.getByRole("button", { name: "Close job" }).click();
  await hanh.locator("dialog").getByRole("button", { name: "Close job" }).click();
  await hanh.waitForSelector("text=Job closed");
  ok(status("growth-marketer") === "closed", "closed");
  const closedPage = await (await fetch(`${APP}/jobs/${slug}`)).text();
  ok(closedPage.includes("This role has closed") && !closedPage.includes('"@type":"JobPosting"'), "a closed job's page says so and drops the job data");
  ok(!(await (await fetch(`${APP}/jobs`)).text()).includes("Senior Growth Marketer"), "a closed job leaves the job list");
  await hanh.reload();
  await hanh.getByRole("button", { name: "Duplicate" }).click();
  await hanh.waitForURL(/saved=1/);
  ok((await hanh.inputValue("#title")) === "Senior Growth Marketer (copy)" && (await hanh.inputValue("#apply_url")) === "https://gamma.test/careers/growth", "duplicate copies the job as a draft");
  await hanh.getByRole("button", { name: "Delete draft" }).click();
  await hanh.locator("dialog").getByRole("button", { name: "Delete draft" }).click();
  await hanh.waitForURL(/\/employer\/jobs$/);
  ok(sql("select count(*) from jobs where title like '%(copy)'") === "0", "a draft can be deleted");

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.error("CRASH", e.message); process.exit(1); });
