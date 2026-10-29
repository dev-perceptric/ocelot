// End-to-end on a real local Supabase: interviews and tasks on cards, the Tasks page, Next up, card lines,
// and time zones. Run like tests/e2e/team.cjs (see "End-to-end tests" in docs/setup.md).
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const APP = "http://localhost:3100", MAIL = "http://127.0.0.1:54324";
const sql = (q) => execSync(`psql postgres://postgres:postgres@127.0.0.1:54322/postgres -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (cond, what) => { console.log(`${cond ? "ok  " : "FAIL"} ${what}`); if (!cond) process.exitCode = 1; };
const day = (offset, tz = "Asia/Ho_Chi_Minh") => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(Date.now() + offset * 86_400_000));

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

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const p = await (await b.newContext()).newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await login(p, "linh@mail.test", "Find a job");
  const uid = sql("select id from auth.users where email = 'linh@mail.test'");
  const brand = sql(`insert into tracker_items (user_id, title, company, stage) values ('${uid}', 'Brand Manager', 'Elsewhere Co', 'applied') returning id`).split("\n")[0];
  const seo = sql(`insert into tracker_items (user_id, title, company, stage) values ('${uid}', 'SEO Lead', 'Beta Co', 'saved') returning id`).split("\n")[0];

  // An interview tomorrow at 15:00 (Vietnam time, the default).
  await p.goto(`${APP}/app/tracker/${brand}`);
  await p.getByRole("button", { name: "Add an interview" }).click();
  await p.locator("dialog[open]").getByLabel("What kind").fill("Hiring manager call");
  await p.locator("dialog[open]").getByLabel("Date", { exact: true }).fill(day(1));
  await p.locator("dialog[open]").getByLabel(/^Time/).fill("15:00");
  await p.locator("dialog[open]").getByLabel("Meeting link").fill("meet.test/abc");
  await p.locator("dialog[open]").getByRole("button", { name: "Add interview" }).click();
  await p.waitForSelector("text=Interview added");
  const startsVN = sql(`select to_char(starts_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI') from interviews where item_id = '${brand}'`);
  ok(startsVN === `${day(1)} 15:00`, "the interview is saved at 15:00 Vietnam time");
  ok(sql(`select stage from tracker_items where id = '${brand}'`) === "interviewing", "adding an interview moves the card to Interviewing");
  await p.reload();
  ok(await p.isVisible("text=Tomorrow at 15:00") && await p.isVisible("text=Join the meeting"), "the card shows when and the link");

  // A task on another card, overdue.
  await p.goto(`${APP}/app/tracker/${seo}`);
  await p.getByRole("button", { name: "Add a task" }).click();
  await p.locator("dialog[open]").getByLabel("Task", { exact: true }).fill("Send portfolio");
  await p.locator("dialog[open]").getByLabel("Due date").fill(day(-1));
  await p.locator("dialog[open]").getByRole("button", { name: "Add task" }).click();
  await p.waitForSelector("text=Task added");

  // Card lines on the board.
  await p.goto(`${APP}/app/tracker`);
  ok(await p.isVisible("article:has-text('Brand Manager') >> text=Interview tomorrow"), "the card line shows the coming interview");
  ok(await p.isVisible("article:has-text('SEO Lead') >> text=Overdue: Send portfolio"), "the card line shows an overdue task");

  // Tasks page: a task with no job, grouping, done and undone, edit, delete.
  await p.goto(`${APP}/app/tasks`);
  ok(await p.isVisible("text=Coming interviews") && await p.isVisible("text=Hiring manager call"), "the Tasks page lists coming interviews");
  await p.getByRole("button", { name: "Add a task" }).click();
  await p.locator("dialog[open]").getByLabel("Task", { exact: true }).fill("Update my CV");
  await p.locator("dialog[open]").getByLabel("Due date").fill(day(0));
  await p.locator("dialog[open]").getByRole("button", { name: "Add task" }).click();
  await p.waitForSelector("text=Task added");
  await p.reload();
  ok(await p.isVisible("h3:has-text('Overdue') + ul >> text=Send portfolio") && await p.isVisible("h3:has-text('Today') + ul >> text=Update my CV"), "tasks are grouped Overdue and Today");
  await p.getByLabel("Mark done: Update my CV").check();
  await sleep(800);
  ok(sql("select done_at is not null from tasks where title = 'Update my CV'") === "t", "a task can be checked off");
  await p.reload();
  ok(await p.isVisible("h3:has-text('Done') + ul >> text=Update my CV"), "done tasks move to Done");
  await p.getByLabel("Mark not done: Update my CV").uncheck();
  await sleep(800);
  ok(sql("select done_at is null from tasks where title = 'Update my CV'") === "t", "and can be unchecked");
  await p.getByRole("button", { name: "Actions for Send portfolio" }).click();
  await p.getByRole("menuitem", { name: "Edit" }).click();
  await p.locator("dialog[open]").getByLabel("Due date").fill(day(3));
  await p.locator("dialog[open]").getByRole("button", { name: "Save task" }).click();
  await p.waitForSelector("text=Task saved");
  ok(sql("select to_char(due_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') from tasks where title = 'Send portfolio'") === day(3), "a task's date can be changed");
  await p.getByRole("button", { name: "Actions for Update my CV" }).click();
  await p.getByRole("menuitem", { name: "Delete" }).click();
  await p.locator("dialog[open]").getByRole("button", { name: "Delete task" }).click();
  await p.waitForSelector("text=Task deleted");
  ok(sql("select count(*) from tasks where title = 'Update my CV'") === "0", "a task can be deleted");

  // Overview: Next up.
  await p.goto(`${APP}/app`);
  ok(await p.isVisible("text=Next up") && await p.isVisible("text=Hiring manager call") && await p.isVisible("text=Send portfolio"), "My search shows what's next");

  // Time zones: in London, 15:00 means London time.
  sql(`update profiles set time_zone = 'Europe/London' where id = '${uid}'`);
  await p.goto(`${APP}/app/tracker/${seo}`);
  await p.getByRole("button", { name: "Add an interview" }).click();
  await p.locator("dialog[open]").getByLabel("Date", { exact: true }).fill(day(2, "Europe/London"));
  await p.locator("dialog[open]").getByLabel(/^Time/).fill("15:00");
  await p.locator("dialog[open]").getByRole("button", { name: "Add interview" }).click();
  await p.waitForSelector("text=Interview added");
  ok(sql(`select to_char(starts_at at time zone 'Europe/London', 'HH24:MI') from interviews where item_id = '${seo}'`) === "15:00", "times follow the person's own time zone");

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.error("CRASH", e.message); process.exit(1); });
