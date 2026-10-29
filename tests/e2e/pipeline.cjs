// End-to-end on a real local Supabase: the applicant pipeline. Lists, filters, moving several at once, the
// applicant page, résumé links, team notes, and what the candidate sees. Run like tests/e2e/team.cjs (see "End-to-end tests" in docs/setup.md).
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


const API = "http://127.0.0.1:54321", SECRET = process.env.SUPABASE_SECRET;
const one = (q) => sql(q).split("\n")[0];

(async () => {
  if (!SECRET) throw new Error("Set SUPABASE_SECRET (the local secret key)");
  const b = await chromium.launch();
  const errors = [];
  const page = async () => { const p = await (await b.newContext()).newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p; };

  // A company with two jobs, and three people who applied.
  const boss = await page();
  await login(boss, "boss@eps.test", "Hire for my company");
  const bossId = sql("select id from auth.users where email = 'boss@eps.test'");
  sql(`update profiles set full_name = 'Bao Owner' where id = '${bossId}'`);
  const org = one("insert into orgs (name, slug) values ('Epsilon', 'epsilon') returning id");
  sql(`insert into org_members (org_id, user_id, role) values ('${org}', '${bossId}', 'owner')`);
  const job = (slug, title) => one(`insert into jobs (org_id, slug, title, workplace, eligible_countries, description, status, published_at, expires_at)
    values ('${org}', '${slug}', '${title}', 'remote', '{VN}', 'Work.', 'published', now(), now() + interval '30 days') returning id`);
  const seo = job("eps-seo", "SEO Lead"), sdr = job("eps-sdr", "SDR");

  const kim = await page();
  await login(kim, "kim@mail.test", "Find a job");
  const kimId = sql("select id from auth.users where email = 'kim@mail.test'");
  const up = await fetch(`${API}/storage/v1/object/resumes/${kimId}/cv.pdf`, { method: "POST", headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": "application/pdf" }, body: "%PDF-1.4 kim" });
  ok(up.ok, "test résumé uploaded");
  const doc = one(`insert into documents (user_id, name, storage_path, mime_type, size_bytes) values ('${kimId}', 'Kim CV', '${kimId}/cv.pdf', 'application/pdf', 12) returning id`);
  const snap = (name, extra = "") => `jsonb_build_object('name', '${name}', 'email', '${name.toLowerCase().split(" ")[0]}@mail.test', 'headline', 'SEO specialist', 'city', 'Hanoi', 'country_code', 'VN', 'years_experience', 4, 'languages', jsonb_build_array('en', 'vi'), 'answers', jsonb_build_array(jsonb_build_object('prompt', 'Why us?', 'answer', 'Your content team.')), 'note', 'Free from December.'${extra})`;
  const kimApp = one(`insert into applications (job_id, org_id, candidate_id, resume_id, snapshot) values ('${seo}', '${org}', '${kimId}', '${doc}', ${snap("Kim Ho")}) returning id`);
  for (const [i, name, j] of [[1, "Long Vu", seo], [2, "Nga Do", sdr]]) {
    sql(`insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c${i}', '${name.split(" ")[0].toLowerCase()}@mail.test')`);
    sql(`insert into applications (job_id, org_id, candidate_id, snapshot) values ('${j}', '${org}', '00000000-0000-0000-0000-0000000000c${i}', ${snap(name)})`);
  }

  // The list.
  await boss.goto(`${APP}/employer/applicants`);
  ok(await boss.getByRole("link", { name: "All 3" }).isVisible() && await boss.getByRole("link", { name: "New 3" }).isVisible(), "stage tabs show counts");
  ok(await boss.isVisible("text=Kim Ho") && await boss.isVisible("text=Nga Do"), "every applicant is listed");
  await boss.getByRole("combobox", { name: "Job" }).click();
  await boss.getByRole("option", { name: "SEO Lead" }).click();
  await boss.waitForURL(/job=/);
  await boss.waitForSelector("text=All 2");
  ok(!(await boss.isVisible("text=Nga Do")), "filtering by job");

  await boss.getByLabel("Select all").check();
  await boss.getByRole("button", { name: "Move selected" }).click();
  await boss.getByRole("menuitem", { name: "Move to Reviewing" }).click();
  await boss.waitForSelector("text=Moved 2 applicants to Reviewing");
  ok(sql(`select count(*) from applications where job_id = '${seo}' and hiring_stage = 'reviewing'`) === "2", "several applicants move at once");
  await boss.getByRole("link", { name: "Reviewing 2" }).click();
  await boss.waitForURL(/tab=reviewing/);
  ok(await boss.isVisible("text=Kim Ho") && await boss.isVisible("text=Long Vu"), "the Reviewing tab lists them");

  // The applicant page.
  await boss.getByRole("link", { name: "Kim Ho" }).click();
  await boss.waitForURL(/\/employer\/applicants\/[0-9a-f-]{36}$/);
  ok(await boss.isVisible("text=SEO specialist") && await boss.isVisible("text=Hanoi, Vietnam") && await boss.isVisible("text=English, Vietnamese"), "the profile as sent");
  ok(await boss.isVisible("text=Why us?") && await boss.isVisible("text=Your content team.") && await boss.isVisible("text=Free from December."), "answers and note");
  ok(await boss.getByRole("link", { name: "kim@mail.test" }).isVisible(), "email to contact them");

  const r = await boss.request.get(`${APP}/employer/applicants/${kimApp}/resume`, { maxRedirects: 0 });
  const to = r.headers()["location"] ?? "";
  ok(r.status() >= 300 && r.status() < 400 && /\/object\/sign\/resumes\//.test(to), "the résumé opens through a signed link");
  ok((await (await fetch(to)).text()).startsWith("%PDF"), "and it's the file that was sent");

  const other = await page();
  await login(other, "zed@other.test", "Hire for my company");
  const zedId = sql("select id from auth.users where email = 'zed@other.test'");
  const otherOrg = one("insert into orgs (name, slug) values ('Other Co', 'other-co') returning id");
  sql(`insert into org_members (org_id, user_id, role) values ('${otherOrg}', '${zedId}', 'owner')`);
  ok((await other.request.get(`${APP}/employer/applicants/${kimApp}/resume`, { maxRedirects: 0 })).status() === 404, "another company can't open the résumé");
  ok((await other.goto(`${APP}/employer/applicants/${kimApp}`)).status() === 404, "or the applicant");

  await boss.locator("#hiring-stage").click();
  await boss.getByRole("option", { name: "Interviewing" }).click();
  await boss.waitForSelector("text=Moved to Interviewing");
  ok(sql(`select hiring_stage from applications where id = '${kimApp}'`) === "interviewing", "the stage picker moves them");

  await boss.getByLabel("New note").fill("Great portfolio. Ask about link building.");
  await boss.getByRole("button", { name: "Add note" }).click();
  await boss.waitForSelector("text=Note added");
  await boss.waitForSelector("li >> text=Great portfolio");
  ok(await boss.isVisible("text=Bao Owner,"), "notes show who wrote them");
  ok(await boss.isVisible("text=Bao Owner moved to Interviewing"), "history shows who moved them");

  // The candidate sees the outcome, never the notes, and their own stage stays theirs.
  const card = sql(`select id from tracker_items where application_id = '${kimApp}'`);
  await kim.goto(`${APP}/app/tracker/${card}`);
  ok(await kim.isVisible("text=Invited to interview"), "the candidate sees the invite on their card");
  ok(!(await kim.isVisible("text=Reviewing")) && !(await kim.isVisible("text=Great portfolio")), "but never Reviewing or the notes");
  ok(sql(`select stage from tracker_items where id = '${card}'`) === "applied", "and their own stage doesn't move");

  await boss.getByRole("button", { name: "Delete note" }).click();
  await boss.locator("dialog[open]").getByRole("button", { name: "Delete note" }).click();
  await boss.waitForSelector("text=Note deleted");
  ok(sql(`select count(*) from application_notes where application_id = '${kimApp}'`) === "0", "the author can delete their note");

  // After the candidate withdraws, the company can't move them.
  await kim.getByRole("button", { name: "Withdraw application" }).click();
  await kim.locator("dialog[open]").getByRole("button", { name: "Withdraw application" }).click();
  await kim.waitForSelector("text=Application withdrawn");
  await boss.reload();
  ok(await boss.isVisible("text=The candidate withdrew."), "a withdrawn applicant can't be moved");
  await boss.goto(`${APP}/employer/applicants?job=${seo}`);
  await boss.getByLabel("Select all").check();
  await boss.getByRole("button", { name: "Move selected" }).click();
  await boss.getByRole("menuitem", { name: "Move to Offer" }).click();
  await boss.waitForSelector("text=Moved 1 applicant to Offer");
  ok(sql(`select hiring_stage from applications where id = '${kimApp}'`) === "withdrawn", "moving several skips withdrawn ones");

  await boss.goto(`${APP}/employer/jobs/${seo}`);
  ok(await boss.getByRole("link", { name: "2 applicants" }).isVisible(), "the job page links to its applicants");

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.error("CRASH", e.message); process.exit(1); });
