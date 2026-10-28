// End-to-end on a real local Supabase: Ana makes a company and invites Fay; Fay joins; roles and leaving.
// Run: npx supabase start, then build and start the app on :3100 against it, then node tests/e2e/team.cjs.
// See "End-to-end tests" in docs/setup.md. Not part of CI (needs Docker).
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const APP = "http://localhost:3100", MAIL = "http://127.0.0.1:54324";
const out = process.argv[2] ?? require("os").tmpdir();
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

async function login(page, email) {
  const at = new Date(Date.now() - 1000);
  await page.fill("#email", email);
  await page.click("button[type=submit]");
  await page.waitForSelector("#code");
  await page.fill("#code", await code(email, at));
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const ana = await (await b.newContext()).newPage();
  ana.on("pageerror", (e) => errors.push("ana: " + e.message));

  // Ana signs up, picks Hire, creates a company.
  await ana.goto(`${APP}/login`);
  await login(ana, "ana@acme.test");
  ok(ana.url().includes("/welcome"), "new person lands on the first-run question");
  await ana.getByText("Hire for my company").click();
  await ana.getByRole("button", { name: "Continue" }).click();
  await ana.waitForURL(/\/employer$/);
  ok(true, "Hire goes to For employers");
  await ana.fill("#name", "Acme Test");
  await ana.getByRole("button", { name: "Create company" }).click();
  await ana.waitForSelector("text=Acme Test");
  ok(await ana.isVisible("a[href='/employer/team']"), "company created; Team appears in the menu");

  // Company settings: website on her email's domain gives Email verified. Logo upload.
  await ana.goto(`${APP}/employer/company`);
  await ana.fill("#website", "acme.test");
  await ana.fill("#industry", "Software");
  await ana.click("#office_places"); await ana.keyboard.type("hanoi"); await ana.keyboard.press("Enter"); await ana.keyboard.press("Escape");
  await ana.getByRole("button", { name: "Save company" }).click();
  await ana.waitForSelector("text=Company saved");
  await ana.reload();
  ok(await ana.isVisible("text=Email verified"), "website on the members' email domain shows Email verified");
  ok((await ana.inputValue("#industry")) === "Software", "company details saved");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await ana.setInputFiles("input[type=file]", { name: "logo.png", mimeType: "image/png", buffer: png });
  await ana.waitForSelector("text=Logo saved", { timeout: 10000 }).catch(() => {});
  const logoUrl = sql("select logo_url from orgs where name = 'Acme Test'");
  ok(/\/storage\/v1\/object\/public\/logos\/.+\.png$/.test(logoUrl), "logo uploaded to the company's folder");
  ok((await fetch(logoUrl)).status === 200, "logo is publicly readable");
  await ana.screenshot({ path: out + "/e2e-company.png", fullPage: true });

  // Invite Fay as admin.
  await ana.goto(`${APP}/employer/team`);
  await ana.getByRole("button", { name: "Invite people" }).click();
  await ana.fill("#invite-email", "fay@acme.test");
  await ana.click("#invite-role"); await ana.getByRole("option", { name: /Admin/ }).click();
  await ana.getByRole("button", { name: "Send invite" }).click();
  await ana.waitForSelector("text=We emailed");
  ok(true, "invite sent");
  await ana.screenshot({ path: out + "/e2e-invite-sent.png" });
  await ana.getByRole("button", { name: "Done" }).click();
  await ana.reload();
  ok(await ana.isVisible("text=fay@acme.test"), "open invite is listed");
  const payload = JSON.parse(sql("select payload from jobs_queue where payload->>'kind' = 'team_invite' order by id desc limit 1"));
  const link = payload.html.match(/href="(http[^"]+\/invite\/[0-9a-f]+)"/)[1];
  ok(payload.to === "fay@acme.test" && /Accept invite/.test(payload.html), "invite email is queued with its link");

  // Someone else can't use Fay's link.
  const gus = await (await b.newContext()).newPage();
  await gus.goto(link.replace(/^https?:\/\/[^/]+/, APP));
  await login(gus, "gus@mail.test");
  if (gus.url().includes("/welcome")) { await gus.getByText("Find a job").click(); await gus.getByRole("button", { name: "Continue" }).click(); await gus.waitForURL(/invite/); }
  await gus.waitForSelector("text=This invite was sent to", { timeout: 5000 }).catch(() => {});
  ok(await gus.isVisible("text=This invite was sent to"), "a different signed-in person is told to switch accounts");

  // Fay opens the link, signs up, joins.
  const fay = await (await b.newContext()).newPage();
  fay.on("pageerror", (e) => errors.push("fay: " + e.message));
  await fay.goto(link.replace(/^https?:\/\/[^/]+/, APP));
  ok(fay.url().includes("/login?next=%2Finvite%2F"), "invite link asks to sign in first");
  await login(fay, "fay@acme.test");
  await fay.getByText("Hire for my company").click();
  await fay.getByRole("button", { name: "Continue" }).click();
  await fay.waitForURL(/\/invite\//);
  ok(await fay.isVisible("text=invited you to join"), "after the first-run question, Fay is back on the invite");
  await fay.getByRole("button", { name: "Join Acme Test" }).click();
  await fay.waitForURL(/\/employer$/);
  ok(await fay.isVisible("h1:has-text('Acme Test')"), "Fay joined and sees the company");
  ok(sql("select count(*) from jobs_queue where payload->>'kind' = 'invite_accepted' and payload->>'to' = 'ana@acme.test'") === "1", "Ana gets an 'invite accepted' email");

  // Fay (admin) sees Ana as owner with no actions.
  await fay.goto(`${APP}/employer/team`);
  ok(await fay.isVisible("text=Admin"), "Fay is an admin");
  ok(!(await fay.isVisible("[aria-label='Actions for ana@acme.test']")), "an admin gets no actions on the owner");
  await fay.screenshot({ path: out + "/e2e-team-fay.png", fullPage: true });

  // The used link stops working.
  await gus.goto(link.replace(/^https?:\/\/[^/]+/, APP));
  ok(await gus.isVisible("text=This invite was already used"), "a used invite link stops working");

  // Ana makes Fay owner, then can leave.
  await ana.goto(`${APP}/employer/team`);
  await ana.getByRole("button", { name: "Actions for fay@acme.test" }).click();
  await ana.getByRole("menuitem", { name: "Make owner" }).click();
  await ana.waitForSelector("text=is now owner");
  await ana.reload();
  await ana.getByRole("button", { name: "Actions for ana@acme.test" }).click();
  await ana.getByRole("menuitem", { name: "Leave company" }).click();
  await ana.getByRole("button", { name: "Leave company" }).click();
  await ana.waitForURL(/\/employer$/);
  ok(await ana.isVisible("text=Set up your company"), "after making Fay owner, Ana can leave");

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.error("CRASH", e.message); process.exit(1); });
