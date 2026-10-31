// End-to-end on a real local Supabase: job board sync. A stand-in Greenhouse board on port 4244
// (ATS_TEST_URL=http://127.0.0.1:4244 on the app). Needs SUPABASE_SECRET for the hourly key. Run like tests/e2e/team.cjs (see "End-to-end tests" in docs/setup.md).
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


const http = require("http");
const crypto = require("crypto");
const SECRET = process.env.SUPABASE_SECRET;
const one = (q) => sql(q).split("\n")[0];
// Board work runs after the hourly call answers: wait for its result.
const until = async (check, ms = 20000) => { for (const end = Date.now() + ms; Date.now() < end; await sleep(300)) if (check()) return true; return check(); };

// A stand-in Greenhouse board. The test changes `board` between syncs.
const job = (id, title, location) => ({ id, title, absolute_url: `https://boards.greenhouse.io/acmeasia/jobs/${id}`, location: { name: location }, offices: [],
  content: `&lt;p&gt;Join ${title} at Acme Asia.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Own the plan&lt;/li&gt;&lt;/ul&gt;`, updated_at: "2026-10-01T00:00:00Z" });
let board = { jobs: [job(1, "Senior SEO Specialist", "New York, NY"), job(2, "Account Executive", "Toronto, ON"), job(3, "Backend Engineer", "San Francisco, CA"), job(4, "Marketing Manager", "Dublin")] };
let status = 200;
// A real 180 by 180 PNG for the stand-in company's icon.
const zlib = require("zlib");
function png(side) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const head = Buffer.alloc(13); head.writeUInt32BE(side, 0); head.writeUInt32BE(side, 4); head[8] = 8; head[9] = 2;
  const rows = Buffer.concat(Array.from({ length: side }, (_, y) => Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: side * 3 }, (_, i) => (i * 7 + y * 13) % 256))])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", head), chunk("IDAT", zlib.deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}
const ICON = png(180);
const BOARD_LOGO = png(120);
// Web pages the logo check opens, at /web/<host>/<path>: Lumen Asia's board sends people to its careers site,
// whose home page names a square icon. Acme Asia has no website to find, only the logo on its board.
const WEB = {
  "/web/job-boards.greenhouse.io/lumenasia": { status: 302, location: "https://careers.lumenasia.com/jobs" },
  "/web/careers.lumenasia.com/jobs": { html: "<title>Careers</title>" },
  "/web/lumenasia.com/": { html: '<title>Lumen Asia</title><link rel="icon" href="/favicon.svg"><link rel="apple-touch-icon" sizes="180x180" href="/touch.png">' },
  "/web/lumenasia.com/touch.png": { png: ICON },
  "/web/job-boards.greenhouse.io/acmeasia": { html: '<img src="https://recruiting.cdn.greenhouse.io/logos/acme.png" alt="Acme Asia Logo" class="logo"/><img src="/img/greenhouse-logo.svg" class="footer-logo">' },
  "/web/recruiting.cdn.greenhouse.io/logos/acme.png": { png: BOARD_LOGO },
};
const server = http.createServer((req, res) => {
  if (req.url.startsWith("/web/")) {
    const w = WEB[req.url];
    if (!w) { res.statusCode = 404; return res.end("not found"); }
    if (w.location) { res.writeHead(w.status, { Location: w.location }); return res.end(); }
    if (w.png) { res.setHeader("Content-Type", "image/png"); return res.end(w.png); }
    res.setHeader("Content-Type", "text/html"); return res.end(w.html);
  }
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/greenhouse/lumenasia") return res.end(JSON.stringify({ jobs: [{ ...job(9, "Growth Marketing Lead", "Remote - North America"), company_name: "Lumen Asia" }, job(10, "Staff Engineer", "Austin, TX")] }));
  if (req.url === "/greenhouse/otherco") return res.end(JSON.stringify({ jobs: [{ ...job(11, "Field Sales Agent", "Memphis, TN"), company_name: "Totally Different Benefits" }] }));
  if (req.url !== "/greenhouse/acmeasia") { res.statusCode = 404; return res.end("{}"); }
  res.statusCode = status;
  res.end(status === 200 ? JSON.stringify(board) : "{}");
});

(async () => {
  if (!SECRET) throw new Error("Set SUPABASE_SECRET (the local secret key)");
  await new Promise((r) => server.listen(4244, "127.0.0.1", r));
  const b = await chromium.launch();
  const errors = [];
  const p = await (await b.newContext()).newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  try {
    // Only this test's boards are looked for.
    sql("update board_candidates set checked_at = now()");
    await login(p, "ops2@ocelot.test", "Find a job");
    sql("insert into platform_admins (user_id) select id from auth.users where email = 'ops2@ocelot.test'");
    const add = async (link, company) => {
      await p.goto(`${APP}/admin/sources`);
      await p.getByRole("button", { name: "Add job board" }).click();
      await p.locator("dialog[open]").getByLabel("Job board link").fill(link);
      if (company) await p.locator("dialog[open]").getByLabel("New company name").fill(company);
      else {
        await p.locator("dialog[open]").getByRole("combobox", { name: "Company" }).click();
        await p.getByRole("option", { name: "Acme Asia" }).click();
      }
      await p.locator("dialog[open]").getByRole("button", { name: "Add and import" }).click();
    };

    await add("https://example.com/careers", "Nobody");
    await p.waitForSelector("text=Paste a job board link");
    ok(true, "a link that isn't a job board is refused");

    await add("https://boards.greenhouse.io/acmeasia", "Acme Asia");
    await p.waitForSelector("text=Greenhouse board added. 2 of 4 jobs came in.");
    ok(true, "adding a board imports its jobs straight away");
    const org = one("select id from orgs where name = 'Acme Asia'");
    ok(sql(`select string_agg(title || ':' || array_to_string(eligible_countries, ',') || ':' || workplace || ':' || apply_method, '|' order by title) from jobs where org_id = '${org}' and status = 'published'`)
      === "Account Executive:CA:on_site:external|Senior SEO Specialist:US:on_site:external", "only our roles in the US and Canada come in, applying on the company site");
    ok(sql(`select description from jobs where title = 'Senior SEO Specialist'`) === "Join Senior SEO Specialist at Acme Asia.\n\n• Own the plan", "the description is clean text");
    ok(sql(`select role || '|' || seniority from jobs where title = 'Senior SEO Specialist'`) === "seo|senior", "role and level are read from the title");

    await p.goto(`${APP}/jobs?country=CA`);
    ok(await p.isVisible("text=Account Executive"), "imported jobs show in search");
    const slug = sql("select slug from jobs where title = 'Account Executive'");
    await p.goto(`${APP}/jobs/${slug}`);
    ok((await p.getByRole("link", { name: "Apply on company site" }).getAttribute("href")) === "https://boards.greenhouse.io/acmeasia/jobs/2", "Apply goes to the company's board");

    await add("boards.greenhouse.io/acmeasia", "Again");
    await p.waitForSelector("text=This board is already added.");
    ok(true, "a board is added once");

    // The board changes: one job leaves, one is renamed.
    board = { jobs: [{ ...job(2, "Senior Account Executive", "Toronto, ON") }, job(3, "Backend Engineer", "San Francisco, CA")] };
    await p.goto(`${APP}/admin/sources`);
    await p.getByRole("button", { name: "Actions for Greenhouse acmeasia" }).click();
    await p.getByRole("menuitem", { name: "Sync now" }).click();
    await p.waitForSelector("text=Synced: 1 of 2 jobs: 0 new, 1 closed");
    ok(sql("select status from jobs where external_id = '1'") === "closed", "a job that left the board closes");
    ok(sql("select title from jobs where external_id = '2'") === "Senior Account Executive", "changes on the board come through");

    // A broken board changes nothing.
    status = 500;
    await p.getByRole("button", { name: "Actions for Greenhouse acmeasia" }).click();
    await p.getByRole("menuitem", { name: "Sync now" }).click();
    await p.waitForSelector("text=The board answered 500");
    ok(sql("select status from jobs where external_id = '2'") === "published", "a board that fails to load changes nothing");
    await p.reload();
    ok(await p.isVisible("td >> text=The board answered 500. Try again later."), "and the error shows on the list");

    // The hourly run picks it up again; a job that comes back reopens.
    status = 200;
    board = { jobs: [job(1, "Senior SEO Specialist", "New York, NY"), job(2, "Senior Account Executive", "Toronto, ON")] };
    sql("update job_sources set last_synced_at = now() - interval '7 hours'");
    const key = crypto.createHmac("sha256", SECRET).update("ocelot-cron-v1").digest("hex");
    const r = await (await fetch(`${APP}/api/cron`, { method: "POST", headers: { Authorization: `Bearer ${key}` } })).json();
    ok(r.boards === "started", "the hourly call answers at once and boards run after");
    ok(await until(() => sql("select status from jobs where external_id = '1'") === "published"), "the hourly run syncs boards every 6 hours, and returning jobs reopen");

    // A board deleted and added again takes back its old jobs.
    sql("update jobs set source_id = null, status = 'closed' where source = 'ats' and org_id = (select id from orgs where name = 'Acme Asia')");
    sql("delete from job_sources where board = 'acmeasia'");
    await add("boards.greenhouse.io/acmeasia", null);
    await p.waitForSelector("text=Greenhouse board added. 2 of 2 jobs came in.");
    ok(sql("select count(*) from jobs where org_id = (select id from orgs where name = 'Acme Asia')") === "3" && sql("select count(*) from jobs where org_id = (select id from orgs where name = 'Acme Asia') and status = 'published' and source_id is not null") === "2",
      "a board added again takes back its old jobs");

    // A sync where nothing changed on the board writes nothing (each write is logged against the plan).
    const before = sql("select string_agg(updated_at::text, ',' order by id) from jobs where source = 'ats'");
    await p.goto(`${APP}/admin/sources`);
    await p.getByRole("button", { name: "Actions for Greenhouse acmeasia" }).click();
    await p.getByRole("menuitem", { name: "Sync now" }).click();
    await p.waitForSelector("text=Synced: 2 of 2 jobs: 0 new, 0 closed");
    ok(sql("select string_agg(updated_at::text, ',' order by id) from jobs where source = 'ats'") === before, "a sync with no changes writes nothing");

    // Discovery: a company on the list with a board is found and imported with no clicks.
    sql("update board_candidates set checked_at = now()");
    sql("insert into board_candidates (slug, name) values ('lumenasia', 'Lumen') on conflict (slug) do update set checked_at = null, source_id = null, skip = false, provider = null, board = null");
    sql("insert into board_candidates (slug, name) values ('otherco', 'Other Co') on conflict (slug) do update set checked_at = null, source_id = null, skip = false, provider = null, board = null");
    await sleep(2000); // let the last board run finish
    const d = await (await fetch(`${APP}/api/cron`, { method: "POST", headers: { Authorization: `Bearer ${key}` } })).json();
    ok(d.boards === "started" && await until(() => sql("select count(*) from job_sources where board = 'lumenasia'") === "1"), "the hourly run finds a company's board by itself");
    await until(() => sql("select count(*) from jobs where source_id = (select id from job_sources where board = 'lumenasia')") !== "0");
    ok(sql("select provider || '/' || board || '|' || (select name from orgs where id = job_sources.org_id) from job_sources where board = 'lumenasia'") === "greenhouse/lumenasia|Lumen Asia", "adds it under the company's name from the board");
    ok(await until(() => sql("select checked_at is not null from board_candidates where slug = 'otherco'") === "t") && sql("select count(*) from job_sources where board = 'otherco'") === "0"
      && sql("select count(*) from orgs where name = 'Totally Different Benefits'") === "0", "a board under the name that belongs to another company is left out");
    ok(sql("select string_agg(title || ':' || array_to_string(eligible_countries, ','), '|') from jobs where source_id = (select id from job_sources where board = 'lumenasia') and status = 'published'") === "Growth Marketing Lead:US,CA", "and imports its jobs that fit");
    ok(sql("select provider || '/' || board from board_candidates where slug = 'lumenasia'") === "greenhouse/lumenasia" && sql("select checked_at is not null from board_candidates where slug = 'lumenasia'") === "t", "the board is remembered for next week's check");

    // Logos: the new company's website is found from its board, and its square icon becomes the logo.
    ok(await until(() => sql("select logo_url is not null from orgs where name = 'Lumen Asia'") === "t", 30000), "the hourly run finds the company's logo");
    const logo = one("select logo_url from orgs where name = 'Lumen Asia'");
    const img = await fetch(logo);
    ok(img.ok && img.headers.get("content-type") === "image/png" && Buffer.from(await img.arrayBuffer()).equals(ICON), "saved in Ocelot's storage as the site's square icon");
    ok(one("select website from orgs where name = 'Lumen Asia'") === "https://lumenasia.com", "and the website is filled in");
    ok(await until(() => sql("select logo_url is not null and website is null from orgs where name = 'Acme Asia'") === "t"), "a company with no website found gets the logo from its job board");
    ok(Buffer.from(await (await fetch(one("select logo_url from orgs where name = 'Acme Asia'"))).arrayBuffer()).equals(BOARD_LOGO), "the board's logo, saved in Ocelot's storage");
    await p.goto(`${APP}/companies/${one("select slug from orgs where name = 'Lumen Asia'")}`);
    ok(await p.locator(`img[src="${logo}"]`).count() > 0, "the logo shows on the company page");

    await p.goto(`${APP}/admin/sources`);
    await p.getByRole("button", { name: "Actions for Greenhouse lumenasia" }).click();
    await p.getByRole("menuitem", { name: "Delete" }).click();
    await p.locator("dialog[open]").getByRole("button", { name: "Delete board" }).click();
    await p.waitForSelector("text=Board deleted");
    ok(sql("select skip from board_candidates where slug = 'lumenasia'") === "t", "a board Ocelot deletes isn't found again");

    await p.getByRole("button", { name: "Look for a company" }).click();
    await p.locator("dialog[open]").getByLabel("Company name").fill("Zeta Pay");
    await p.locator("dialog[open]").getByRole("button", { name: "Look for it" }).click();
    await p.waitForSelector("text=It's checked in the next hourly run");
    ok(sql("select name || '|' || (checked_at is null) from board_candidates where slug = 'zetapay'") === "Zeta Pay|true", "Ocelot can add a company to look for");

    await p.getByRole("button", { name: "Actions for Greenhouse acmeasia" }).click();
    await p.getByRole("menuitem", { name: "Delete" }).click();
    await p.locator("dialog[open]").getByRole("button", { name: "Delete board" }).click();
    await p.waitForSelector("text=Board deleted");
    await p.waitForSelector("text=Board deleted >> nth=-1");
    await new Promise((r) => setTimeout(r, 500));
    ok(sql(`select count(*) from jobs where org_id = '${org}' and status = 'published'`) === "0" && sql("select count(*) from job_sources") === "0", "deleting a board closes its jobs");
  } finally {
    console.log("page errors:", errors);
    await b.close();
    server.close();
  }
})().catch((e) => { console.error("CRASH", e.message); process.exit(1); });
