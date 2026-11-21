// End-to-end on a real local Supabase: an agency buys listing credits and spends them on its clients' jobs, with the
// same stand-in for Stripe as tests/e2e/billing.cjs. Run like tests/e2e/team.cjs (see "End-to-end tests" in docs/setup.md).
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
  if (page.url().includes("/welcome")) {
    await page.getByText(intent).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/welcome"));
  }
}


const http = require("http");
const crypto = require("crypto");
const WHSEC = "whsec_local", FAKE = "http://127.0.0.1:4243";
const one = (q) => sql(q).split("\n")[0];

// Stand-in for the Stripe API: checkout sessions, payment intents (receipts) and refunds.
const sessions = new Map();
const stripe = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const json = (o) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== "Bearer sk_test_local") { res.statusCode = 401; return json({ error: { message: "bad key" } }); }
    if (req.method === "POST" && req.url === "/v1/checkout/sessions") {
      const p = new URLSearchParams(body);
      const id = `cs_test_agency_${Date.now()}_${sessions.size + 1}`; // its own ids, so it never clashes with billing.cjs
      sessions.set(id, { id, order: p.get("client_reference_id"), amount: Number(p.get("line_items[0][price_data][unit_amount]")), success: p.get("success_url") });
      return json({ id, url: `${FAKE}/pay/${id}` });
    }
    if (req.method === "GET" && req.url.startsWith("/v1/payment_intents/")) return json({ id: "pi_x", latest_charge: { receipt_url: "https://pay.stripe.com/receipts/test" } });
    if (req.method === "POST" && req.url === "/v1/refunds") return json({ id: "re_1" });
    if (req.method === "GET" && req.url.startsWith("/pay/")) { res.setHeader("Content-Type", "text/html"); return res.end("<h1>Stripe Checkout (stand-in)</h1>"); }
    res.statusCode = 404; json({ error: { message: "not here" } });
  });
});

const sign = (payload) => { const t = Math.floor(Date.now() / 1000); return `t=${t},v1=${crypto.createHmac("sha256", WHSEC).update(`${t}.${payload}`).digest("hex")}`; };
async function webhook(event, signature) {
  const payload = JSON.stringify(event);
  const r = await fetch(`${APP}/api/stripe/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": signature ?? sign(payload) }, body: payload });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const paidEvent = (id, s) => ({ id, type: "checkout.session.completed", data: { object: { id: s.id, client_reference_id: s.order, amount_total: s.amount, currency: "usd", payment_status: "paid", payment_intent: "pi_x" } } });

(async () => {
  await new Promise((r) => stripe.listen(4243, "127.0.0.1", r));
  const b = await chromium.launch();
  const errors = [];
  const page = async (who) => { const p = await (await b.newContext()).newPage(); p.on("pageerror", (e) => errors.push(`${who}: ${e.message}`)); return p; };
  try {
    // Start clean, so the test can run again on the same local database.
    sql("delete from orders where agency_name = 'Billing Agency Test' or org_name in ('Billed Client Test', 'Own Team Co Test')");
    sql("delete from agencies where name = 'Billing Agency Test'");
    sql("delete from orgs where name in ('Billed Client Test', 'Own Team Co Test')");
    sql("delete from auth.users where email in ('bea@billing.test', 'ray@billing.test', 'tom@ownteam.test')");
    sql("select set_payments(true)");

    // Bea runs an agency with one client she runs alone; Ray is her recruiter.
    const bea = await page("bea");
    await login(bea, "bea@billing.test", "Hire for my company");
    const beaId = sql("select id from auth.users where email = 'bea@billing.test'");
    const agency = one(`insert into agencies (name, slug, created_by) values ('Billing Agency Test', 'billing-agency-test', '${beaId}') returning id`);
    sql(`insert into agency_members (agency_id, user_id, role) values ('${agency}', '${beaId}', 'owner')`);
    const client = one(`insert into orgs (name, slug, agency_id) values ('Billed Client Test', 'billed-client-test', '${agency}') returning id`);
    const draft = (org, slug, by) => one(`insert into jobs (org_id, slug, title, created_by, role, seniority, employment_type, workplace, eligible_countries, description)
      values ('${org}', '${slug}', 'Sales Lead', '${by}', 'growth', 'mid', 'full_time', 'remote', '{US}', repeat('Lead a sales team across the region. ', 8)) returning id`);

    // She buys a credit for the agency.
    await bea.goto(`${APP}/employer/agency/billing`);
    ok(await bea.isVisible("text=None left"), "a new agency has no credits");
    await bea.getByRole("button", { name: "Buy listing" }).click();
    await bea.waitForURL(/127\.0\.0\.1:4243\/pay\/cs_test_agency_/);
    const s1 = [...sessions.values()].at(-1);
    ok(sql(`select (agency_id = '${agency}') || '|' || (org_id is null) || '|' || status from orders where id = '${s1.order}'`) === "true|true|pending", "Checkout opens with a pending order for the agency");
    const paid1 = await webhook(paidEvent(`evt_agency_1_${Date.now()}`, s1));
    ok(paid1.status === 200 && paid1.body.result === "credit added", "the webhook adds the credit");
    await bea.goto(s1.success);
    ok(await bea.isVisible("text=1 Standard"), "agency billing shows the new credit");
    ok(await bea.locator("tr", { hasText: "Standard" }).getByRole("link", { name: "Receipt" }).isVisible(), "the order has its receipt");
    await bea.screenshot({ path: out + "/e2e-agency-billing.png", fullPage: true });

    // Ray, a recruiter, sends a client's job for review with the agency's credit, without paying.
    const ray = await page("ray");
    await login(ray, "ray@billing.test", "Hire for my company");
    const rayId = sql("select id from auth.users where email = 'ray@billing.test'");
    sql(`insert into agency_members (agency_id, user_id, role) values ('${agency}', '${rayId}', 'recruiter')`);
    const j1 = draft(client, "billed-client-lead", rayId);
    await ray.goto(`${APP}/employer/billing`);
    ok(await ray.isVisible("text=Billing Agency Test has 1 credit for its clients"), "the client's billing page shows the agency's credits");
    ok(!(await ray.isVisible("button:has-text('Buy listing')")), "and doesn't offer to buy for the client");
    await ray.goto(`${APP}/employer/jobs/${j1}`);
    await ray.getByRole("button", { name: "Send for review" }).click();
    await ray.waitForURL(/\?sent=1$/);
    ok(sql(`select status from jobs where id = '${j1}'`) === "pending_review" && sql(`select agency_id from entitlements where job_id = '${j1}'`) === agency, "the agency's credit sends the client's job for review");
    ok(await ray.isVisible("text=Standard listing, paid by Billing Agency Test"), "the job page says the agency paid");

    // With no credit left, a recruiter is sent to an owner or admin.
    const j2 = draft(client, "billed-client-lead-2", rayId);
    await ray.goto(`${APP}/employer/jobs/${j2}`);
    await ray.getByRole("button", { name: "Send for review" }).click();
    await ray.waitForURL(/\?pay=1$/);
    await ray.getByRole("button", { name: "Pay and send for review" }).click();
    await ray.waitForSelector("text=Ask an owner or admin of your agency");
    ok(true, "a recruiter can't pay; an owner or admin buys credits");

    // Bea pays for that job: the agency's order sends it for review.
    await bea.goto(`${APP}/employer/jobs/${j2}?pay=1`);
    await bea.getByRole("button", { name: "Pay and send for review" }).click();
    await bea.waitForURL(/127\.0\.0\.1:4243\/pay\/cs_test_agency_/);
    const s2 = [...sessions.values()].at(-1);
    ok(sql(`select (agency_id = '${agency}') || '|' || (job_id = '${j2}') from orders where id = '${s2.order}'`) === "true|true", "an agency owner pays for a client's job as the agency");
    ok((await webhook(paidEvent(`evt_agency_2_${Date.now()}`, s2))).body.result === "sent", "and the paid job goes to review");

    // A company with its own team: its own people don't spend the agency's credits.
    const tom = await page("tom");
    await login(tom, "tom@ownteam.test", "Hire for my company");
    const tomId = sql("select id from auth.users where email = 'tom@ownteam.test'");
    const own = one(`insert into orgs (name, slug, agency_id) values ('Own Team Co Test', 'own-team-co-test', '${agency}') returning id`);
    sql(`insert into org_members (org_id, user_id, role) values ('${own}', '${tomId}', 'owner')`);
    sql(`select grant_agency_credits('${agency}', 1, null)`);
    const j3 = draft(own, "own-team-lead", tomId);
    await tom.goto(`${APP}/employer/jobs/${j3}`);
    await tom.getByRole("button", { name: "Send for review" }).click();
    await tom.waitForURL(/\?pay=1$/);
    ok(sql(`select count(*) from entitlements where job_id = '${j3}'`) === "0", "a company's own team is asked to pay instead of using its agency's credit");
    await tom.getByRole("button", { name: "Pay and send for review" }).click();
    await tom.waitForURL(/127\.0\.0\.1:4243\/pay\/cs_test_agency_/);
    const s3 = [...sessions.values()].at(-1);
    ok(sql(`select (org_id = '${own}') || '|' || (agency_id is null) from orders where id = '${s3.order}'`) === "true|true", "and its own order is the company's");
  } finally {
    sql("select set_payments(false)");
    console.log("page errors:", errors);
    await b.close();
    stripe.close();
  }
})().catch((e) => { console.error("CRASH", e.message); process.exit(1); });
