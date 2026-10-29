// End-to-end on a real local Supabase: listing credits and Stripe Checkout, with a small stand-in for Stripe
// (STRIPE_API_URL=http://127.0.0.1:4243, STRIPE_SECRET_KEY=sk_test_local, STRIPE_WEBHOOK_SECRET=whsec_local on the app). Run like tests/e2e/team.cjs (see "End-to-end tests" in docs/setup.md).
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
      const id = `cs_test_${sessions.size + 1}`;
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
  const p = await (await b.newContext()).newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  try {
    sql("select set_payments(true)");
    await login(p, "rae@theta.test", "Hire for my company");
    const uid = sql("select id from auth.users where email = 'rae@theta.test'");
    const org = one("insert into orgs (name, slug) values ('Theta Labs', 'theta-labs') returning id");
    sql(`insert into org_members (org_id, user_id, role) values ('${org}', '${uid}', 'owner')`);
    const draft = (slug) => one(`insert into jobs (org_id, slug, title, created_by, role, seniority, employment_type, workplace, eligible_countries, description)
      values ('${org}', '${slug}', 'Content Lead', '${uid}', 'growth', 'mid', 'full_time', 'remote', '{VN}', repeat('Lead our content and SEO across the region. ', 6)) returning id`);
    const j1 = draft("theta-content");

    // No credit: sending for review asks for a listing.
    await p.goto(`${APP}/employer/jobs/${j1}`);
    await p.getByRole("button", { name: "Send for review" }).click();
    await p.waitForURL(/\?pay=1$/);
    ok(await p.isVisible("text=Choose a listing to send this job for review"), "without a credit, sending for review asks for a listing");
    ok(sql(`select status from jobs where id = '${j1}'`) === "draft", "and the job stays a draft");

    await p.getByText("Featured, $99").click();
    await p.getByRole("button", { name: "Pay and send for review" }).click();
    await p.waitForURL(/127\.0\.0\.1:4243\/pay\/cs_test_/);
    const s = [...sessions.values()].at(-1);
    ok(sql(`select status || '|' || package || '|' || amount_cents || '|' || job_id from orders where id = '${s.order}'`) === `pending|featured|9900|${j1}`, "Checkout opens with a pending order for the job");

    ok((await webhook(paidEvent("evt_1", s), "t=1,v1=00")).status === 400, "a webhook without Stripe's signature is refused");
    ok(sql(`select status from orders where id = '${s.order}'`) === "pending", "and changes nothing");
    const first = await webhook(paidEvent("evt_1", s));
    ok(first.status === 200 && first.body.result === "sent", "the signed webhook records the payment");
    ok((await webhook(paidEvent("evt_1", s))).body.result === "repeat", "Stripe sending it again changes nothing");
    ok(sql(`select status || '|' || (receipt_url is not null) from orders where id = '${s.order}'`) === "paid|true", "the order is paid with its receipt");
    ok(sql(`select status from jobs where id = '${j1}'`) === "pending_review" && sql(`select package from entitlements where job_id = '${j1}'`) === "featured", "the job went to review with its Featured listing");

    await p.goto(s.success);
    ok(await p.isVisible("text=Payment received. Sent for review."), "coming back from Stripe says it's in review");
    ok(await p.isVisible("text=Featured listing"), "the job page shows its listing");
    sql(`select publish_job('${j1}')`);
    ok(sql(`select featured_until > now() + interval '6 days' from jobs where id = '${j1}'`) === "t", "once live, Featured is promoted for 7 days");

    // A founding credit is used without paying.
    sql(`select grant_credits('${org}', 1, null)`);
    const j2 = draft("theta-seo");
    await p.goto(`${APP}/employer/jobs/${j2}`);
    await p.getByRole("button", { name: "Send for review" }).click();
    await p.waitForURL(/\?sent=1$/);
    ok(sql(`select status from jobs where id = '${j2}'`) === "pending_review" && sql(`select package from entitlements where job_id = '${j2}'`) === "founding", "a founding credit sends the job without paying");

    // With payments off, nothing is asked.
    sql("select set_payments(false)");
    const j3 = draft("theta-ads");
    await p.goto(`${APP}/employer/jobs/${j3}`);
    await p.getByRole("button", { name: "Send for review" }).click();
    await p.waitForURL(/\?sent=1$/);
    ok(sql(`select status from jobs where id = '${j3}'`) === "pending_review", "with payments off, jobs go to review as before");
  } finally {
    sql("select set_payments(false)");
    console.log("page errors:", errors);
    await b.close();
    stripe.close();
  }
})().catch((e) => { console.error("CRASH", e.message); process.exit(1); });
