// End-to-end on a real local Supabase: a candidate applies to an agency's job, the emails and tracker name the agency,
// and an admin verifies, credits, suspends and restores the agency. Run like tests/e2e/team.cjs (see docs/setup.md).
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const APP = "http://localhost:3100", MAIL = "http://127.0.0.1:54324";
const sql = (q) => execSync(`psql postgres://postgres:postgres@127.0.0.1:54322/postgres -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const out = process.argv[2] ?? require("os").tmpdir();
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
const PDF = { name: "Lea Tran CV.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n") };
const one = (q) => sql(q).split("\n")[0];

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const page = async (who) => { const p = await (await b.newContext()).newPage(); p.on("pageerror", (e) => errors.push(`${who}: ${e.message}`)); return p; };
  try {
    // Start clean, so the test can run again on the same local database.
    sql("delete from agencies where name = 'Admin Agency Test'");
    sql("delete from orgs where name = 'Admin Client Test'");
    sql("delete from jobs_queue where payload->>'to' in ('lea@mail.test', 'amy@adminagency.test', 'max@ocelot.test')");
    sql("delete from audit_events where action like 'agency.%' or action = 'billing.grant_agency_credits'");
    sql("delete from auth.users where email in ('lea@mail.test', 'amy@adminagency.test', 'max@ocelot.test')");

    // Amy runs an agency with one client and a live job that takes applications on Ocelot.
    const amy = await page("amy");
    await login(amy, "amy@adminagency.test", "Hire for my company");
    const amyId = sql("select id from auth.users where email = 'amy@adminagency.test'");
    const agency = one(`insert into agencies (name, slug, created_by) values ('Admin Agency Test', 'admin-agency-test', '${amyId}') returning id`);
    sql(`insert into agency_members (agency_id, user_id, role) values ('${agency}', '${amyId}', 'owner')`);
    const client = one(`insert into orgs (name, slug, agency_id) values ('Admin Client Test', 'admin-client-test', '${agency}') returning id`);
    sql(`insert into jobs (org_id, slug, title, created_by, status, published_at, expires_at, workplace, eligible_countries, role, seniority, employment_type, description, apply_method)
      values ('${client}', 'admin-agency-ae', 'Agency Account Executive', '${amyId}', 'published', now(), now() + interval '30 days', 'remote', '{US}', 'growth', 'mid', 'full_time',
              repeat('Close new business with mid-size teams. ', 8), 'ocelot')`);

    // Lea applies. She sees who receives it, and the emails name the agency.
    const lea = await page("lea");
    await login(lea, "lea@mail.test", "Find a job");
    const leaId = sql("select id from auth.users where email = 'lea@mail.test'");
    await lea.goto(`${APP}/jobs/admin-agency-ae/apply`);
    ok(await lea.isVisible("text=Your application goes to"), "the apply form names the agency and the client");
    await lea.getByLabel("Full name").fill("Lea Tran");
    await lea.getByRole("button", { name: "Upload résumé" }).click();
    await lea.locator("dialog[open] input[type=file]").setInputFiles(PDF);
    await lea.waitForSelector("text=Résumé uploaded");
    await lea.waitForSelector("#resume:has-text('Lea Tran CV')");
    await lea.getByRole("button", { name: "Send application" }).click();
    await lea.waitForURL(/\/app\/tracker\/[0-9a-f-]{36}$/);
    ok(await lea.isVisible("text=Sent to Admin Agency Test, a recruiting agency hiring for Admin Client Test"), "the tracker card says who received it");
    ok(sql(`select agency_name from applications where candidate_id = '${leaId}'`) === "Admin Agency Test", "the application records the agency");
    const receipt = JSON.parse(sql("select payload from jobs_queue where payload->>'kind' = 'application_sent' and payload->>'to' = 'lea@mail.test' order by id desc limit 1"));
    ok(/Admin Agency Test, the recruiting agency hiring for Admin Client Test/.test(receipt.text), "the receipt email names the agency");
    ok(sql("select count(*) from jobs_queue where payload->>'kind' = 'new_applicant' and payload->>'to' = 'amy@adminagency.test'") === "1", "the agency's staff get the new applicant email");

    // Amy moves Lea to interviews; Lea's card keeps her own stage, and the email names the agency.
    const appId = sql(`select id from applications where candidate_id = '${leaId}'`);
    await amy.goto(`${APP}/employer/applicants/${appId}`);
    ok(await amy.isVisible("text=Lea Tran"), "agency staff open the applicant");
    await amy.locator("#hiring-stage").click();
    await amy.getByRole("option", { name: "Interviewing" }).click();
    await amy.waitForSelector("text=Moved to Interviewing");
    ok(sql(`select hiring_stage from applications where id = '${appId}'`) === "interviewing", "agency staff move the applicant to interviews");
    const stageMail = JSON.parse(sql("select payload from jobs_queue where payload->>'kind' = 'stage_interviewing' and payload->>'to' = 'lea@mail.test' order by id desc limit 1"));
    ok(/Admin Agency Test, a recruiting agency, handles this hiring for Admin Client Test/.test(stageMail.text), "the interview email names the agency");
    ok(sql(`select stage from tracker_items where application_id = '${appId}'`) === "applied", "the agency's stage never moves the candidate's card");

    // Max, an Ocelot admin, verifies the agency, gives it credits, then suspends it and lifts it.
    const max = await page("max");
    await login(max, "max@ocelot.test", "Find a job");
    sql("insert into platform_admins select id from auth.users where email = 'max@ocelot.test'");
    await max.goto(`${APP}/admin/agencies`);
    ok(await max.isVisible("text=Admin Agency Test"), "admins see the agency in the list");
    await max.getByRole("link", { name: "Admin Agency Test" }).click();
    await max.waitForURL(/\/admin\/agencies\/[0-9a-f-]{36}$/);
    ok(await max.isVisible("text=Admin Client Test") && await max.isVisible("text=Run by the agency"), "the agency page lists its clients");

    await ask(max, "Mark Agency verified", "What did you check?", "Business registration 123456", "Mark verified");
    await max.waitForSelector("text=Marked Agency verified");
    ok(sql(`select business_verified_note from agencies where id = '${agency}'`) === "Business registration 123456", "an admin marks the agency verified");
    await ask(max, "Give founding credits", "How many (1 to 50)", "3", "Give credits");
    await max.waitForSelector("text=Credits added");
    ok(sql(`select count(*) from entitlements where agency_id = '${agency}' and job_id is null`) === "3", "an admin gives the agency founding credits");

    await ask(max, "Suspend agency", "Reason (kept in the audit log). Every client's jobs are hidden too.", "Charged candidates a fee", "Suspend agency");
    await max.waitForSelector("text=Agency suspended");
    ok(sql(`select suspended_at is not null and suspended_by_agency from orgs where id = '${client}'`) === "t", "suspending the agency suspends its client");
    const visitor = await page("visitor");
    const r = await visitor.goto(`${APP}/jobs/admin-agency-ae`);
    ok(r.status() === 404, "the client's job leaves public pages");
    await max.goto(`${APP}/admin/companies/${client}`);
    ok(await max.isVisible("text=Suspended because the agency is"), "the client's admin page says why it's suspended");
    await max.screenshot({ path: out + "/e2e-admin-agency-client.png", fullPage: true });

    await max.goto(`${APP}/admin/agencies/${agency}`);
    await max.getByRole("button", { name: "Lift suspension" }).click();
    await max.locator("dialog").getByRole("button", { name: "Lift suspension" }).click();
    await max.waitForSelector("text=Suspension lifted");
    ok(sql(`select suspended_at is null from orgs where id = '${client}'`) === "t", "lifting it brings the client back");
    ok((await visitor.goto(`${APP}/jobs/admin-agency-ae`)).status() === 200, "and its job is public again");
    await max.reload();
    ok(await max.isVisible("text=agency.suspend") && await max.isVisible("text=agency.verify"), "every admin action is in the agency's history");
    await max.screenshot({ path: out + "/e2e-admin-agency.png", fullPage: true });
  } finally {
    console.log("page errors:", errors);
    await b.close();
  }
})().catch((e) => { console.error("CRASH", e.message); process.exit(1); });
