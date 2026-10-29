"use server";

import { redirect } from "next/navigation";
import { SITE_URL } from "@/lib/env";
import { myOrgs } from "@/lib/org";
import { PACKAGES, isPaidPackage } from "@/lib/packages";
import { createCheckout, stripeEnv } from "@/lib/stripe";
import { createAdmin } from "@/lib/supabase/server";

export type BuyState = { error?: string };

// Starts a Stripe Checkout for one listing. With a job, the job must be ready for review and have no credit yet;
// the webhook then attaches the credit and sends the job to review. The order is written with the service role
// after checking the person is on the company's team.
export async function startCheckout(_: BuyState, form: FormData): Promise<BuyState> {
  const pkg = String(form.get("package") ?? "");
  const jobId = String(form.get("job_id") ?? "") || null;
  if (!isPaidPackage(pkg)) return { error: "Choose a listing." };
  const { supabase, user, current } = await myOrgs();
  if (!user || !current) return { error: "Your session ended. Log in again." };

  let title: string | null = null;
  if (jobId) {
    const { data: job } = await supabase.from("jobs").select("id, title, status").eq("id", jobId).eq("org_id", current.id).maybeSingle();
    if (!job || !["draft", "rejected"].includes(job.status)) return { error: "This job can't be sent for review now." };
    const { data: missing, error } = await supabase.rpc("job_ready", { p_job: job.id });
    if (error) return { error: "That didn't work. Try again." };
    if (missing) return { error: missing };
    const { data: has } = await supabase.from("entitlements").select("id").eq("job_id", job.id).maybeSingle();
    if (has) return { error: "This job already has a listing. Send it for review." };
    title = job.title;
  }

  const db = createAdmin();
  const { data: order, error } = await db.from("orders").insert({
    org_id: current.id, job_id: jobId, package: pkg, amount_cents: PACKAGES[pkg].cents, currency: "USD", created_by: user.id,
  }).select("id").single();
  if (error || !order) return { error: "That didn't work. Try again." };

  let url: string;
  try {
    const back = jobId ? `${SITE_URL}/employer/jobs/${jobId}` : `${SITE_URL}/employer/billing`;
    const s = await createCheckout(stripeEnv(), {
      orderId: order.id, pkg, email: user.email, jobTitle: title, successUrl: `${back}?paid=1`, cancelUrl: jobId ? `${back}?pay=1` : back,
    });
    await db.from("orders").update({ stripe_session_id: s.id }).eq("id", order.id);
    url = s.url;
  } catch (e) {
    await db.from("orders").update({ status: "failed" }).eq("id", order.id);
    const msg = e instanceof Error && /set up/.test(e.message) ? e.message : "Stripe didn't answer. Try again.";
    return { error: msg };
  }
  redirect(url);
}
