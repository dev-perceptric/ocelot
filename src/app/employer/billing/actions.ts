"use server";

import { redirect } from "next/navigation";
import { SITE_URL } from "@/lib/env";
import { canManageAgency, myOrgs } from "@/lib/org";
import { PACKAGES, isPaidPackage } from "@/lib/packages";
import { createCheckout, stripeEnv } from "@/lib/stripe";
import { createAdmin } from "@/lib/supabase/server";

export type BuyState = { error?: string };

// Starts a Stripe Checkout for one listing. With a job, the job must be ready for review and have no credit yet;
// the webhook then attaches the credit and sends the job to review. The order is written with the service role
// after checking who is asking.
// Who pays: the company, when the buyer is on its own team. The agency, when the buyer works on the company only
// through its agency, or buys from the agency's billing page (for="agency"). Agency purchases are for its owners
// and admins.
export async function startCheckout(_: BuyState, form: FormData): Promise<BuyState> {
  const pkg = String(form.get("package") ?? "");
  const jobId = String(form.get("job_id") ?? "") || null;
  if (!isPaidPackage(pkg)) return { error: "Choose a listing." };
  const { supabase, user, current, agency, agencies } = await myOrgs();
  if (!user) return { error: "Your session ended. Log in again." };

  if (form.get("for") === "agency") {
    if (!agency || !canManageAgency(agency.role)) return { error: "Only agency owners and admins can buy credits." };
    return checkout({ userId: user.id, email: user.email, pkg, jobId: null, title: null, owner: { agency_id: agency.id }, back: `${SITE_URL}/employer/agency/billing` });
  }
  if (!current) return { error: "Your session ended. Log in again." };
  const viaAgency = current.teamRole === null && current.agency;
  if (viaAgency && !canManageAgency(agencies.find((x) => x.id === current.agency?.id)?.role)) {
    return { error: "Ask an owner or admin of your agency to buy listing credits." };
  }

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

  return checkout({
    userId: user.id, email: user.email, pkg, jobId, title,
    owner: viaAgency ? { agency_id: current.agency!.id } : { org_id: current.id },
    back: jobId ? `${SITE_URL}/employer/jobs/${jobId}` : `${SITE_URL}/employer/billing`,
  });
}

async function checkout(o: {
  userId: string; email: string | undefined; pkg: Parameters<typeof createCheckout>[1]["pkg"]; jobId: string | null; title: string | null;
  owner: { org_id: string } | { agency_id: string }; back: string;
}): Promise<BuyState> {
  const { userId, pkg, jobId, back } = o;
  const db = createAdmin();
  const { data: order, error } = await db.from("orders").insert({
    ...o.owner, job_id: jobId, package: pkg, amount_cents: PACKAGES[pkg].cents, currency: "USD", created_by: userId,
  }).select("id").single();
  if (error || !order) return { error: "That didn't work. Try again." };

  let url: string;
  try {
    const s = await createCheckout(stripeEnv(), {
      orderId: order.id, pkg, email: o.email, jobTitle: o.title, successUrl: `${back}?paid=1`, cancelUrl: jobId ? `${back}?pay=1` : back,
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
