import { NextResponse, type NextRequest } from "next/server";
import { receiptUrl, stripeEnv, verifyStripeSignature } from "@/lib/stripe";
import { createAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PAID = ["checkout.session.completed", "checkout.session.async_payment_succeeded"];

// Stripe calls this after a payment. The signature proves it came from Stripe; record_payment handles each
// event once, checks the amount against the order, adds the credit and sends the job to review.
// Answering with an error makes Stripe try again later.
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const body = await req.text();
  if (!verifyStripeSignature(body, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }
  let event: { id: string; type: string; data?: { object?: Record<string, unknown> } };
  try { event = JSON.parse(body); } catch { return NextResponse.json({ error: "bad body" }, { status: 400 }); }
  if (!PAID.includes(event.type)) return NextResponse.json({ ok: true, ignored: event.type });

  const s = event.data?.object ?? {};
  if (s.payment_status !== "paid") return NextResponse.json({ ok: true, waiting: true });
  const orderId = String(s.client_reference_id ?? (s.metadata as Record<string, string> | undefined)?.order_id ?? "");
  if (!/^[0-9a-f-]{36}$/.test(orderId)) return NextResponse.json({ ok: true, ignored: "no order" });

  const db = createAdmin();
  const { data: result, error } = await db.rpc("record_payment", {
    p_event: event.id, p_type: event.type, p_order: orderId, p_session: String(s.id ?? ""),
    p_amount: Number(s.amount_total ?? -1), p_currency: String(s.currency ?? ""), p_payment_intent: String(s.payment_intent ?? ""),
  });
  if (error) {
    console.error("record_payment failed", error.message);
    return NextResponse.json({ error: "not recorded" }, { status: 500 });
  }
  if (result !== "repeat" && s.payment_intent) {
    try {
      const url = await receiptUrl(stripeEnv(), String(s.payment_intent));
      if (url) await db.from("orders").update({ receipt_url: url }).eq("id", orderId);
    } catch (e) {
      console.error("receipt link not saved", e);
    }
  }
  return NextResponse.json({ ok: true, result });
}
