"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { keepValues } from "@/components/forms";
import { Button, RadioCards } from "@/components/ui";
import { PACKAGES, dollars } from "@/lib/packages";
import { startCheckout, type BuyState } from "./actions";

// Pick Standard or Featured and pay in Stripe Checkout. With a job, paying also sends it for review.
export function BuyListing({ jobId, label }: { jobId?: string; label: string }) {
  const [state, action, pending] = useActionState<BuyState, FormData>(startCheckout, {});
  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-4">
      {jobId ? <input type="hidden" name="job_id" value={jobId} /> : null}
      <RadioCards name="package" legend="Listing" defaultValue="standard" required options={[
        { value: "standard", label: `Standard, ${dollars(PACKAGES.standard.cents)}`, line: PACKAGES.standard.line },
        { value: "featured", label: `Featured, ${dollars(PACKAGES.featured.cents)}`, line: PACKAGES.featured.line },
      ]} />
      {state.error ? <p className="text-meta text-danger" role="alert">{state.error}</p> : null}
      <div><Button type="submit" disabled={pending} aria-busy={pending}>{pending ? "Opening Stripe" : label}</Button></div>
    </form>
  );
}

// After Stripe sends people back, the webhook may take a few seconds. Check again until it lands.
export function PaymentWait() {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (tries >= 20) return;
    const t = setTimeout(() => { router.refresh(); setTries((n) => n + 1); }, 3000);
    return () => clearTimeout(t);
  }, [tries, router]);
  return <p className="mt-4 border border-border bg-surface p-4 text-body rounded-[var(--radius-card)]" role="status">
    {tries >= 20 ? "We haven't heard from Stripe yet. Reload this page in a minute." : "Payment received. Confirming with Stripe."}
  </p>;
}
