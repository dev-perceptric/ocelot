// End-to-end on a real local Supabase: saving a search, the hourly run (alerts and task reminders) and
// managing saved searches in Settings. Needs SUPABASE_SECRET (the local secret key) for the hourly key. Run like tests/e2e/team.cjs (see "End-to-end tests" in docs/setup.md).
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


const crypto = require("crypto");
const SECRET = process.env.SUPABASE_SECRET;
const one = (q) => sql(q).split("\n")[0];
const cron = async (key) => {
  const r = await fetch(`${APP}/api/cron`, { method: "POST", headers: key ? { Authorization: `Bearer ${key}` } : {} });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

(async () => {
  if (!SECRET) throw new Error("Set SUPABASE_SECRET (the local secret key)");
  const KEY = crypto.createHmac("sha256", SECRET).update("ocelot-cron-v1").digest("hex");
  const b = await chromium.launch();
  const errors = [];
  const p = await (await b.newContext()).newPage();
  p.on("pageerror", (e) => errors.push(e.message));

  const org = one("insert into orgs (name, slug) values ('Iota Media', 'iota-media') returning id");
  const job = (slug, title, where, published) => sql(`insert into jobs (org_id, slug, title, workplace, eligible_countries, description, status, published_at, expires_at)
    values ('${org}', '${slug}', '${title}', '${where}', '{VN}', 'Work.', 'published', ${published}, now() + interval '30 days')`);
  job("iota-old", "Old Remote Role", "remote", "now() - interval '20 days'");

  await login(p, "lin@mail.test", "Find a job");
  const uid = sql("select id from auth.users where email = 'lin@mail.test'");

  // Save a search from Find jobs.
  await p.goto(`${APP}/jobs?where=remote&country=VN`);
  await p.getByRole("button", { name: "Save search" }).click();
  ok(await p.locator("dialog[open]").getByLabel("Name").inputValue() !== "", "the name is filled in from the filters");
  await p.locator("dialog[open]").getByLabel("Name").fill("Remote in Vietnam");
  await p.locator("dialog[open]").getByText("Daily").click();
  await p.locator("dialog[open]").getByRole("button", { name: "Save search" }).click();
  await p.waitForSelector("text=Search saved");
  const saved = sql(`select frequency || '|' || (filters->>'country') || '|' || (filters->'where'->>0) from saved_searches where user_id = '${uid}' and name = 'Remote in Vietnam'`);
  ok(saved === "daily|VN|remote", "the search is saved with its filters and frequency");

  // The hourly run.
  ok((await cron()).status === 401 && (await cron("wrong")).status === 401, "the hourly address needs the worker's key");
  sql(`update saved_searches set checked_at = now() - interval '2 days' where user_id = '${uid}'`);
  job("iota-seo", "Remote SEO Lead", "remote", "now() - interval '1 hour'");
  job("iota-office", "Office Manager", "on_site", "now() - interval '1 hour'");
  const run = await cron(KEY);
  ok(run.status === 200 && run.body.alerts === 1, "the run sends the alert");
  const mail = sql(`select payload->>'subject' || '|' || (payload->>'html' like '%Remote SEO Lead%') || '|' || (payload->>'html' like '%Office Manager%') || '|' || (payload->>'html' like '%Old Remote Role%')
    from jobs_queue where payload->>'kind' = 'job_alert' and payload->>'to' = 'lin@mail.test'`);
  ok(mail === "1 new job for Remote in Vietnam|true|false|false", "with only new jobs that match");
  ok((await cron(KEY)).body.alerts === 0, "nothing new, nothing sent");

  // A task due today, once it's past 8:00 where the person is. Pick a time zone where it's 9:00 to 22:00 now.
  const zones = ["Pacific/Kiritimati", "Pacific/Auckland", "Asia/Tokyo", "Asia/Ho_Chi_Minh", "Asia/Dubai", "Europe/London", "America/Sao_Paulo", "America/New_York", "America/Los_Angeles", "Pacific/Honolulu"];
  const tz = zones.find((z) => { const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: z, hour: "2-digit", hourCycle: "h23" }).format(new Date())); return h >= 9 && h <= 22; });
  sql(`update profiles set time_zone = '${tz}' where id = '${uid}'`);
  sql(`insert into tasks (user_id, title, due_at) values ('${uid}', 'Send portfolio to Minh', now() + interval '30 minutes')`);
  const r2 = await cron(KEY);
  ok(r2.body.reminders === 1 && sql(`select count(*) from jobs_queue where payload->>'kind' = 'task_reminder' and payload->>'subject' = 'Today: Send portfolio to Minh'`) === "1", `a reminder goes out the morning a task is due (${tz})`);
  ok((await cron(KEY)).body.reminders === 0, "once");

  // Settings: change how often, then delete.
  await p.goto(`${APP}/app/settings`);
  ok(await p.getByRole("link", { name: "Remote in Vietnam" }).getAttribute("href") === "/jobs?where=remote&country=VN", "Settings links each search");
  await p.getByRole("combobox", { name: "How often for Remote in Vietnam" }).click();
  await p.getByRole("option", { name: "Weekly" }).click();
  await p.waitForSelector("text=Saved");
  ok(sql(`select frequency from saved_searches where user_id = '${uid}'`) === "weekly", "frequency can be changed");
  await p.getByLabel("Reminders the morning a task is due").click();
  await p.waitForSelector("text=Saved >> nth=-1");
  await new Promise((r) => setTimeout(r, 500));
  ok(sql(`select task_reminders from notification_prefs where user_id = '${uid}'`) === "f", "reminders can be turned off");
  await p.getByRole("button", { name: "Delete Remote in Vietnam" }).click();
  await p.locator("dialog[open]").getByRole("button", { name: "Delete search" }).click();
  await p.waitForSelector("text=Search deleted");
  ok(sql(`select count(*) from saved_searches where user_id = '${uid}'`) === "0", "a saved search can be deleted");

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.error("CRASH", e.message); process.exit(1); });
