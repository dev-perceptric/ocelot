// End-to-end on a real local Supabase: an agency, its staff, a new client, and a company that says yes.
// Run: npx supabase start, then build and start the app on :3100 against it, then node tests/e2e/agency.cjs.
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
  const page = async (who) => { const p = await (await b.newContext()).newPage(); p.on("pageerror", (e) => errors.push(`${who}: ${e.message}`)); return p; };
  const hire = async (p) => {
    if (!p.url().includes("/welcome")) return;
    await p.getByText("Hire for my company").click();
    await p.getByRole("button", { name: "Continue" }).click();
    await p.waitForURL((u) => !u.pathname.startsWith("/welcome"));
  };
  const linkFor = (kind, to) => {
    const payload = JSON.parse(sql(`select payload from jobs_queue where payload->>'kind' = '${kind}' and payload->>'to' = '${to}' order by id desc limit 1`));
    return payload.html.match(/href="(http[^"]+\/invite\/[0-9a-f]+)"/)[1].replace(/^https?:\/\/[^/]+/, APP);
  };

  // Ava sets up an agency from the empty For employers page.
  const ava = await page("ava");
  await ava.goto(`${APP}/login`);
  await login(ava, "ava@hireco.test");
  await hire(ava);
  await ava.goto(`${APP}/employer`);
  await ava.getByRole("link", { name: "Set up an agency" }).click();
  await ava.waitForURL(/\/employer\/agency$/);
  await ava.fill("#agency-name", "Hire Co Test");
  await ava.getByRole("button", { name: "Create agency" }).click();
  await ava.waitForSelector("h1:has-text('Hire Co Test')");
  ok(await ava.isVisible("a[href='/employer/agency/team']"), "agency created; Agency team appears in the menu");
  ok(await ava.isVisible("text=No clients yet"), "a new agency has no clients");

  // She adds a new client and opens it.
  await ava.getByRole("button", { name: "Add a client" }).click();
  await ava.fill("#client-name", "Client One Test");
  await ava.getByRole("button", { name: "Add client" }).click();
  await ava.waitForSelector("text=is now a client");
  await ava.getByRole("button", { name: "Done" }).click();
  await ava.waitForSelector("td >> text=Run by your agency");
  ok(true, "the new client is listed as run by the agency");
  await ava.screenshot({ path: out + "/e2e-agency.png", fullPage: true });
  await ava.getByRole("button", { name: "Client One Test", exact: true }).click();
  await ava.waitForURL(/\/employer$/);
  ok(await ava.isVisible("h1:has-text('Client One Test')") && await ava.isVisible("text=Managed by Hire Co Test"), "opening a client shows it as managed by the agency");

  // On the client's Team page she can look but not invite: the client has no team of its own.
  await ava.goto(`${APP}/employer/team`);
  ok(await ava.isVisible("text=You work on Client One Test through Hire Co Test"), "agency staff see a client's team page as read-only");
  ok(!(await ava.isVisible("button:has-text('Invite people')")), "agency staff can't invite to a client's team");

  // She invites Rex as a recruiter. Someone else can't use his link; Rex can.
  await ava.goto(`${APP}/employer/agency/team`);
  await ava.getByRole("button", { name: "Invite people" }).click();
  await ava.fill("#invite-email", "rex@hireco.test");
  await ava.getByRole("button", { name: "Send invite" }).click();
  await ava.waitForSelector("text=We emailed");
  const link = linkFor("agency_invite", "rex@hireco.test");
  ok(true, "agency invite email is queued with its link");

  const rex = await page("rex");
  await rex.goto(link);
  await login(rex, "rex@hireco.test");
  await hire(rex);
  if (!rex.url().includes("/invite/")) await rex.goto(link);
  ok(await rex.isVisible("text=invited you to join the agency"), "Rex sees the agency invite");
  await rex.getByRole("button", { name: "Join Hire Co Test" }).click();
  await rex.waitForURL(/\/employer\/agency$/);
  ok(await rex.isVisible("h1:has-text('Hire Co Test')"), "Rex joined the agency");
  ok(!(await rex.isVisible("button:has-text('Add a client')")), "a recruiter can't add clients");
  ok(sql("select count(*) from jobs_queue where payload->>'kind' = 'agency_joined' and payload->>'to' = 'ava@hireco.test'") === "1", "Ava hears that Rex joined");
  await rex.goto(`${APP}/employer`);
  ok(await rex.isVisible("h1:has-text('Client One Test')"), "Rex works on the agency's client");
  await rex.goto(`${APP}/employer/agency/team`);
  ok(await rex.isVisible("text=Recruiter") && !(await rex.isVisible("button:has-text('Invite people')")), "Rex is a recruiter and can't invite staff");

  // Oli owns Omega. Ava asks to manage it; Oli says yes on his Team page.
  const oli = await page("oli");
  await oli.goto(`${APP}/login`);
  await login(oli, "oli@omega.test");
  await hire(oli);
  await oli.goto(`${APP}/employer`);
  await oli.fill("#name", "Omega Test");
  await oli.getByRole("button", { name: "Create company" }).click();
  await oli.waitForSelector("h1:has-text('Omega Test')");
  const omegaSlug = sql("select slug from orgs where name = 'Omega Test'");

  await ava.goto(`${APP}/employer/agency`);
  await ava.getByRole("button", { name: "Add a client" }).click();
  await ava.getByRole("button", { name: "Already on Ocelot" }).click();
  await ava.fill("#client-address", `joinocelot.com/companies/${omegaSlug}`);
  await ava.getByRole("button", { name: "Send request" }).click();
  await ava.waitForSelector("text=Nothing changes until its owner says yes");
  await ava.getByRole("button", { name: "Done" }).click();
  await ava.reload();
  ok(await ava.isVisible("text=Omega Test hasn't answered yet"), "the waiting request is listed");
  ok(sql("select count(*) from jobs_queue where payload->>'kind' = 'client_request' and payload->>'to' = 'oli@omega.test'") === "1", "Omega's owner gets an email");

  await oli.goto(`${APP}/employer/team`);
  ok(await oli.isVisible("text=Hire Co Test asked to manage"), "Oli sees the request on his Team page");
  await oli.screenshot({ path: out + "/e2e-agency-request.png", fullPage: true });
  await oli.getByRole("button", { name: "Say yes" }).click();
  await oli.getByRole("button", { name: "Say yes" }).last().click();
  await oli.waitForSelector("text=now manages Omega Test");
  await oli.reload();
  ok(await oli.isVisible("text=manages Omega Test's hiring"), "Omega shows its agency");
  ok(sql("select count(*) from jobs_queue where payload->>'kind' = 'client_request_answered' and payload->>'to' = 'ava@hireco.test'") === "1", "Ava hears the answer");

  await ava.goto(`${APP}/employer/agency`);
  ok(await ava.isVisible("td >> text=Has its own team"), "Omega is listed as a client with its own team");
  ok(await ava.isVisible("text=Omega Test said yes"), "the accepted request shows");

  // Oli removes the agency. The agency loses Omega right away.
  await oli.getByRole("button", { name: "Remove agency" }).click();
  await oli.getByRole("button", { name: "Remove agency" }).last().click();
  await oli.waitForSelector("text=no longer manages Omega Test");
  await ava.reload();
  ok(!(await ava.isVisible("td >> text=Omega Test")), "removing the agency takes Omega off its clients");

  // Ava deletes the client she ran alone.
  await ava.getByRole("button", { name: "Actions for Client One Test" }).click();
  await ava.getByRole("menuitem", { name: "Delete client" }).click();
  await ava.getByRole("button", { name: "Delete client" }).click();
  await ava.waitForSelector("text=Client One Test was deleted");
  ok(sql("select count(*) from orgs where name = 'Client One Test'") === "0", "an agency owner deletes a client it ran alone");

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.error("CRASH", e.message); process.exit(1); });
