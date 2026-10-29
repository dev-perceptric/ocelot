// Stripe, without the SDK: the few calls Ocelot makes, the webhook signature check and the packages.
// Plain functions with no app imports, so tests can load them. Billing runs from Ocelot's Singapore company.

import { createHmac, timingSafeEqual } from "node:crypto";
import { PACKAGES, type PaidPackage } from "./packages.ts";

// Stripe's form encoding: { line_items: [{ price_data: { currency: "usd" } }] } -> line_items[0][price_data][currency]=usd
export function formEncode(obj: Record<string, unknown>): string {
  const out: string[] = [];
  const walk = (v: unknown, key: string) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${key}[${i}]`));
    else if (typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, key ? `${key}[${k}]` : k);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  };
  walk(obj, "");
  return out.join("&");
}

// Checks the Stripe-Signature header: t=<time>,v1=<hmac>[,v1=...]. Five minutes of clock difference at most.
export function verifyStripeSignature(payload: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v ?? "");
  if (!Number.isFinite(t) || !sigs.length || Math.abs(nowSeconds - t) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest();
  return sigs.some((s) => {
    const got = Buffer.from(s, "hex");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

// For tests: the header Stripe would send for this payload.
export function signStripePayload(payload: string, secret: string, t = Math.floor(Date.now() / 1000)): string {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;
}

type Env = { secretKey?: string; apiUrl?: string; fetchImpl?: typeof fetch };

async function call(env: Env, method: "GET" | "POST", path: string, params?: Record<string, unknown>) {
  if (!env.secretKey) throw new Error("Payments aren't set up yet.");
  const base = (env.apiUrl || "https://api.stripe.com").replace(/\/$/, "");
  const q = method === "GET" && params ? `?${formEncode(params)}` : "";
  const res = await (env.fetchImpl ?? fetch)(`${base}/v1/${path}${q}`, {
    method,
    headers: { Authorization: `Bearer ${env.secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: method === "POST" && params ? formEncode(params) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`stripe ${res.status} ${body?.error?.message ?? ""}`.trim());
  return body;
}

export async function createCheckout(env: Env, o: { orderId: string; pkg: PaidPackage; email?: string | null; jobTitle?: string | null; successUrl: string; cancelUrl: string }): Promise<{ id: string; url: string }> {
  const p = PACKAGES[o.pkg];
  const s = await call(env, "POST", "checkout/sessions", {
    mode: "payment",
    client_reference_id: o.orderId,
    metadata: { order_id: o.orderId },
    payment_intent_data: { metadata: { order_id: o.orderId } },
    customer_email: o.email ?? undefined,
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: p.cents, product_data: { name: p.name, description: o.jobTitle ? `${o.jobTitle}. ${p.line}` : p.line } } }],
    success_url: o.successUrl,
    cancel_url: o.cancelUrl,
  });
  if (!s?.id || !s?.url) throw new Error("stripe: no checkout address");
  return { id: s.id, url: s.url };
}

export async function receiptUrl(env: Env, paymentIntent: string): Promise<string | null> {
  const pi = await call(env, "GET", `payment_intents/${encodeURIComponent(paymentIntent)}`, { expand: ["latest_charge"] });
  return pi?.latest_charge?.receipt_url ?? null;
}

export async function refundPayment(env: Env, paymentIntent: string): Promise<void> {
  await call(env, "POST", "refunds", { payment_intent: paymentIntent });
}

export const stripeEnv = (): Env => ({ secretKey: process.env.STRIPE_SECRET_KEY, apiUrl: process.env.STRIPE_API_URL });
