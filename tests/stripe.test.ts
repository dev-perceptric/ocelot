import { test } from "node:test";
import assert from "node:assert/strict";
import { dollars } from "../src/lib/packages.ts";
import { createCheckout, formEncode, signStripePayload, verifyStripeSignature } from "../src/lib/stripe.ts";

test("form encoding follows Stripe's nested keys", () => {
  assert.equal(formEncode({ mode: "payment", metadata: { order_id: "o1" }, line_items: [{ quantity: 1, price_data: { unit_amount: 4900 } }], skip: undefined }),
    "mode=payment&metadata%5Border_id%5D=o1&line_items%5B0%5D%5Bquantity%5D=1&line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=4900");
});

test("webhook signatures: right secret and fresh time only", () => {
  const body = '{"id":"evt_1"}';
  const now = 1_800_000_000;
  const header = signStripePayload(body, "whsec_test", now);
  assert.ok(verifyStripeSignature(body, header, "whsec_test", now));
  assert.ok(verifyStripeSignature(body, `${header},v1=deadbeef`, "whsec_test", now), "any matching v1 counts");
  assert.ok(!verifyStripeSignature(body, header, "whsec_other", now), "wrong secret");
  assert.ok(!verifyStripeSignature(body + " ", header, "whsec_test", now), "changed body");
  assert.ok(!verifyStripeSignature(body, header, "whsec_test", now + 301), "too old");
  assert.ok(!verifyStripeSignature(body, null, "whsec_test", now));
  assert.ok(!verifyStripeSignature(body, "t=abc,v1=zz", "whsec_test", now));
});

test("checkout sends the order id, the price and the return addresses", async () => {
  let sent = "";
  const fetchImpl = (async (_url: string, init: { body: string }) => { sent = init.body; return new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.test/cs_1" })); }) as unknown as typeof fetch;
  const s = await createCheckout({ secretKey: "sk_test", fetchImpl }, { orderId: "o1", pkg: "featured", jobTitle: "SDR", successUrl: "https://x/ok", cancelUrl: "https://x/no" });
  assert.deepEqual(s, { id: "cs_1", url: "https://checkout.test/cs_1" });
  const p = new URLSearchParams(sent);
  assert.equal(p.get("client_reference_id"), "o1");
  assert.equal(p.get("line_items[0][price_data][unit_amount]"), "9900");
  assert.equal(p.get("success_url"), "https://x/ok");
  await assert.rejects(createCheckout({}, { orderId: "o1", pkg: "standard", successUrl: "a", cancelUrl: "b" }), /aren't set up/);
});

test("prices read as dollars", () => {
  assert.equal(dollars(4900), "$49");
  assert.equal(dollars(9950), "$99.50");
});

test("the cron key matches only the same secret", async () => {
  const { checkCronToken, cronToken } = await import("../src/lib/cronToken.ts");
  const t = cronToken("secret-a");
  assert.ok(checkCronToken(`Bearer ${t}`, "secret-a"));
  assert.ok(!checkCronToken(`Bearer ${t}`, "secret-b"));
  assert.ok(!checkCronToken(null, "secret-a") && !checkCronToken(`Bearer ${t}`, undefined) && !checkCronToken("Bearer x", "secret-a"));
});
