// End-to-end on a real local Supabase: export my data and delete account.
// Run the same way as tests/e2e/team.cjs (see "End-to-end tests" in docs/setup.md).
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const APP = "http://localhost:3100", MAIL = "http://127.0.0.1:54324", API = "http://127.0.0.1:54321";
// The local stack's SECRET_KEY from `npx supabase start` (never a live key).
const SECRET = process.env.SUPABASE_SECRET;
if (!SECRET) throw new Error("Set SUPABASE_SECRET to the local SECRET_KEY");
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
async function deleteMe(page, typed) {
  await page.goto(`${APP}/app/settings`);
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.fill("#delete-confirm", typed);
  await page.locator("dialog").getByRole("button", { name: "Delete account" }).click();
}

(async () => {
  const b = await chromium.launch();
  const errors = [];

  // Ana owns Acme with Fay in it. Sam runs a company alone.
  const ana = await (await b.newContext()).newPage();
  await login(ana, "ana@acme.test", "Hire for my company");
  await ana.fill("#name", "Acme Test"); await ana.getByRole("button", { name: "Create company" }).click(); await ana.waitForSelector("h1:has-text('Acme Test')");
  const acme = sql("select id from orgs where name = 'Acme Test'");
  const sam = await (await b.newContext()).newPage();
  await login(sam, "sam@solo.test", "Hire for my company");
  await sam.fill("#name", "Solo Shop"); await sam.getByRole("button", { name: "Create company" }).click(); await sam.waitForSelector("h1:has-text('Solo Shop')");
  const cam = await (await b.newContext()).newPage();
  cam.on("pageerror", (e) => errors.push(e.message));
  await login(cam, "cam@mail.test", "Find a job");
  const fay = await (await b.newContext()).newPage();
  await login(fay, "fay@acme.test", "Hire for my company");
  sql(`insert into org_members (org_id, user_id, role) select '${acme}', id, 'member' from auth.users where email = 'fay@acme.test'`);

  // Cam: profile, a tracked job, a résumé file, and an application to Acme.
  const camId = sql("select id from auth.users where email = 'cam@mail.test'");
  await cam.goto(`${APP}/app/profile`); await cam.fill("#full_name", "Cam Pham"); await cam.getByRole("button", { name: "Save profile" }).click(); await cam.waitForSelector("text=Profile saved");
  sql(`insert into tracker_items (user_id, title, company, notes) values ('${camId}', 'Growth Lead', 'Elsewhere', 'private note')`);
  const up = await fetch(`${API}/storage/v1/object/resumes/${camId}/cv.pdf`, { method: "POST", headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": "application/pdf" }, body: "%PDF-1.4 test" });
  ok(up.ok, "résumé file uploaded");
  const doc = sql(`insert into documents (user_id, name, storage_path, mime_type, size_bytes) values ('${camId}', 'cv.pdf', 'resumes/${camId}/cv.pdf', 'application/pdf', 13) returning id`).split("\n")[0];
  const job = sql(`insert into jobs (org_id, slug, title, status, published_at) values ('${acme}', 'acme-cs', 'CS Manager', 'published', now()) returning id`).split("\n")[0];
  sql(`insert into applications (job_id, org_id, candidate_id, snapshot, resume_id) values ('${job}', '${acme}', '${camId}', '{"name":"Cam Pham","email":"cam@mail.test"}', '${doc}')`);

  // Export: one file with everything Cam owns, nothing of anyone else's.
  const res = await cam.request.get(`${APP}/api/me/export`);
  ok(res.status() === 200 && /attachment; filename="ocelot-data-/.test(res.headers()["content-disposition"] ?? ""), "export downloads a file");
  const data = await res.json();
  ok(data.account.email === "cam@mail.test" && data.profile.full_name === "Cam Pham", "export has account and profile");
  // Two items: the one Cam added, and the one applying to Acme added on its own.
  ok(data.tracker.items.length === 2 && data.tracker.items.some((i) => i.notes === "private note"), "export has the tracker");
  ok(data.applications.length === 1 && data.applications[0].org.name === "Acme Test", "export has applications sent");
  ok(data.documents.length === 1, "export lists résumés");
  ok(!JSON.stringify(data).includes("ana@acme.test"), "export has nobody else's data");
  const anon = await (await b.newContext()).request.get(`${APP}/api/me/export`);
  ok(anon.status() === 401, "export needs sign-in");

  // Ana is the only owner of a team: she has to hand over first.
  await deleteMe(ana, "ana@acme.test");
  await ana.waitForSelector("#delete-confirm-error");
  ok(/only owner of Acme Test/.test(await ana.textContent("#delete-confirm-error")), "the only owner of a team can't delete yet");

  // A wrong confirmation is refused.
  await deleteMe(cam, "someone@else.test");
  await cam.waitForSelector("#delete-confirm-error");
  ok(sql(`select count(*) from auth.users where id = '${camId}'`) === "1", "a wrong confirmation deletes nothing");

  // Cam deletes the account.
  await cam.fill("#delete-confirm", "cam@mail.test");
  await cam.locator("dialog").getByRole("button", { name: "Delete account" }).click();
  await cam.waitForURL(/\/goodbye$/);
  ok(true, "deleting lands on the goodbye page");
  ok(sql(`select count(*) from auth.users where id = '${camId}'`) === "0", "the sign-in is gone");
  ok(sql(`select count(*) from profiles where id = '${camId}'`) === "0", "the profile is gone");
  ok(sql(`select count(*) from tracker_items where user_id = '${camId}'`) === "0", "the tracker is gone");
  ok(sql(`select count(*) from storage.objects where bucket_id = 'resumes' and name like '${camId}/%'`) === "0", "the résumé file is gone");
  ok(sql(`select candidate_id is null and snapshot->>'deleted' = 'true' and snapshot->>'name' is null and resume_id is null from applications where job_id = '${job}'`) === "t", "Acme keeps the application without Cam's details");
  ok(sql("select count(*) from audit_events where action = 'account.delete'") === "1", "the deletion is in the audit log");
  await cam.goto(`${APP}/app`);
  ok(cam.url().includes("/login"), "the browser is signed out");

  // Sam's company goes with Sam's account.
  await sam.goto(`${APP}/app/settings`);
  await sam.getByRole("button", { name: "Delete account" }).click();
  ok(await sam.isVisible("text=Solo Shop"), "the dialog names companies that go with the account");
  await sam.fill("#delete-confirm", "sam@solo.test");
  await sam.locator("dialog").getByRole("button", { name: "Delete account" }).click();
  await sam.waitForURL(/\/goodbye$/);
  ok(sql("select count(*) from orgs where name = 'Solo Shop'") === "0", "a company with nobody else in it is deleted too");
  ok(sql("select count(*) from orgs where name = 'Acme Test'") === "1", "other companies stay");

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.error("CRASH", e.message); process.exit(1); });
