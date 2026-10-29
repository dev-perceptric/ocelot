// End-to-end on a real local Supabase: applying on Ocelot, the snapshot, the receipt email, sent résumés,
// withdrawing and closed jobs. Run like tests/e2e/team.cjs (see "End-to-end tests" in docs/setup.md).
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


const PDF = { name: "Mai Nguyen CV.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n") };

(async () => {
  sql("insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e2', 'boss@delta.test')");
  const org = sql("insert into orgs (name, slug) values ('Delta Digital', 'delta-digital') returning id").split("\n")[0];
  sql(`insert into org_members (org_id, user_id, role) values ('${org}', '00000000-0000-0000-0000-0000000000e2', 'owner')`);
  const job = sql(`insert into jobs (org_id, slug, title, workplace, eligible_countries, description, status, published_at, expires_at)
       values ('${org}', 'delta-marketing', 'Marketing Manager', 'remote', '{VN}', 'Run our campaigns.', 'published', now(), now() + interval '30 days') returning id`).split("\n")[0];
  sql(`insert into job_questions (job_id, position, prompt, required) values ('${job}', 1, 'Why Delta?', true), ('${job}', 2, 'Portfolio link', false)`);
  sql(`insert into jobs (org_id, slug, title, workplace, eligible_countries, description, status, published_at, expires_at)
       values ('${org}', 'delta-closed', 'Closed Role', 'remote', '{VN}', 'Gone.', 'closed', now() - interval '40 days', now() - interval '10 days')`);

  const b = await chromium.launch();
  const errors = [];
  const p = await (await b.newContext()).newPage();
  p.on("pageerror", (e) => errors.push(e.message));

  await p.goto(`${APP}/jobs/delta-marketing`);
  ok((await p.getByRole("link", { name: "Apply", exact: true }).getAttribute("href")) === "/login?next=/jobs/delta-marketing/apply", "visitors are sent to log in first");

  await login(p, "mai@mail.test", "Find a job");
  const uid = sql("select id from auth.users where email = 'mai@mail.test'");
  await p.goto(`${APP}/jobs/delta-marketing`);
  await p.getByRole("link", { name: "Apply", exact: true }).click();
  await p.waitForURL(/\/jobs\/delta-marketing\/apply$/);
  ok(await p.isVisible("text=Apply to Delta Digital"), "Apply opens the form");

  await p.getByRole("button", { name: "Send application" }).click();
  await p.waitForSelector("text=Choose your résumé.");
  ok(await p.isVisible("text=Add your name.") && await p.isVisible("text=Answer this question."), "missing name, résumé and required answers are shown");
  ok(sql("select count(*) from applications") === "0", "nothing is sent");

  await p.getByLabel("Full name").fill("Mai Nguyen");
  await p.getByLabel("Phone (optional)").fill("+84 90 555 1234");
  await p.getByLabel("Why Delta?").fill("I ran campaigns for three SaaS brands.");
  await p.getByLabel("Note to the company (optional)").fill("Available from December.");
  await p.getByRole("button", { name: "Upload résumé" }).click();
  await p.locator("dialog[open] input[type=file]").setInputFiles(PDF);
  await p.waitForSelector("text=Résumé uploaded");
  await p.waitForSelector("#resume:has-text('Mai Nguyen CV')");
  ok(await p.getByLabel("Why Delta?").inputValue() === "I ran campaigns for three SaaS brands.", "uploading a résumé keeps what was typed");
  await p.getByRole("button", { name: "Send application" }).click();
  await p.waitForURL(/\/app\/tracker\/[0-9a-f-]{36}$/);
  ok(await p.isVisible("text=Updates from the company") && await p.isVisible("text=Application sent"), "sending opens the card with the company's updates");

  const app = sql(`select snapshot->>'name' || '|' || (snapshot->>'phone') || '|' || (snapshot->'answers'->0->>'answer') || '|' || (snapshot->'answers'->1->>'answer') || '|' || (snapshot->>'note') from applications where candidate_id = '${uid}'`);
  ok(app === "Mai Nguyen|+84 90 555 1234|I ran campaigns for three SaaS brands.||Available from December.", "the application holds what was sent");
  ok(sql(`select full_name from profiles where id = '${uid}'`) === "Mai Nguyen", "the name is saved to the profile");
  ok(sql(`select stage from tracker_items where user_id = '${uid}'`) === "applied", "the card is Applied");
  ok(sql("select count(*) from jobs_queue where payload->>'kind' = 'application_sent' and payload->>'to' = 'mai@mail.test'") === "1", "a receipt email is queued");
  ok(sql("select count(*) from jobs_queue where payload->>'kind' = 'new_applicant' and payload->>'to' = 'boss@delta.test' and payload->>'subject' = 'New applicant for Marketing Manager: Mai Nguyen'") === "1", "the company gets a new applicant email");

  await p.goto(`${APP}/jobs/delta-marketing`);
  ok(await p.getByRole("link", { name: /^Applied \d+ \w+$/ }).isVisible(), "the job page shows it was applied to");
  await p.goto(`${APP}/jobs/delta-marketing/apply`);
  await p.waitForURL(/\/app\/tracker\//);
  ok(true, "the form can't be sent twice");

  // Deleting the sent résumé keeps the company's copy.
  await p.goto(`${APP}/app/resumes`);
  await p.getByRole("button", { name: "Actions for Mai Nguyen CV" }).click();
  await p.getByRole("menuitem", { name: "Delete" }).click();
  ok(await p.locator("dialog[open]").getByText("Companies you sent it to keep their copy.").isVisible(), "deleting a sent résumé says the company keeps it");
  await p.locator("dialog[open]").getByRole("button", { name: "Delete résumé" }).click();
  await p.waitForSelector("text=Résumé deleted");
  ok(sql(`select deleted_at is not null from documents where user_id = '${uid}'`) === "t", "the résumé is hidden");
  ok(sql(`select count(*) from storage.objects where bucket_id = 'resumes' and name like '${uid}/%'`) === "1", "its file stays for the company");
  ok(!(await p.isVisible("table >> text=Mai Nguyen CV")), "and it leaves the list");

  // Withdraw.
  const card = sql(`select id from tracker_items where user_id = '${uid}'`);
  await p.goto(`${APP}/app/tracker/${card}`);
  await p.getByRole("button", { name: "Withdraw application" }).click();
  await p.locator("dialog[open]").getByRole("button", { name: "Withdraw application" }).click();
  await p.waitForSelector("text=Application withdrawn");
  ok(sql(`select hiring_stage from applications where candidate_id = '${uid}'`) === "withdrawn", "the candidate can withdraw");
  ok(sql(`select stage from tracker_items where id = '${card}'`) === "withdrawn", "the card moves to Withdrawn");
  await p.reload();
  ok(!(await p.getByRole("button", { name: "Withdraw application" }).isVisible()), "withdrawing is final");

  await p.goto(`${APP}/jobs/delta-closed/apply`);
  ok(await p.isVisible("text=This job isn't taking applications."), "a closed job takes no applications");

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.error("CRASH", e.message); process.exit(1); });
