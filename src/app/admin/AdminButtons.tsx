"use client";

import { useTransition } from "react";
import { askConfirm, askText } from "@/components/Dialog";
import { toast } from "@/components/Toast";
import { Button } from "@/components/ui";
import * as A from "./actions";

type Result = { ok: boolean; message?: string };

function Act({ label, variant = "outline", run, okText }: { label: string; variant?: "outline" | "danger" | "secondary"; run: () => Promise<Result | null>; okText: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant={variant} disabled={pending} aria-busy={pending}
      onClick={() => start(async () => { const r = await run(); if (r) toast(r.ok ? okText : r.message ?? "That didn't work."); })}>
      {label}
    </Button>
  );
}

export function CompanyActions({ id, name, verified, trusted, suspended }: { id: string; name: string; verified: boolean; trusted: boolean; suspended: boolean }) {
  return (
    <div className="flex flex-wrap gap-3">
      {verified ? (
        <Act label="Remove Company verified" okText="Label removed" run={async () =>
          (await askConfirm({ title: `Remove Company verified from ${name}?`, confirm: "Remove label", danger: true })) ? A.unverifyCompany(id) : null} />
      ) : (
        <Act label="Mark Company verified" okText="Marked Company verified" run={async () => {
          const note = await askText({ title: `Verify ${name}`, label: "What did you check?", confirm: "Mark verified" });
          return note ? A.verifyCompany(id, note) : null;
        }} />
      )}
      <Act label={trusted ? "Stop trusting" : "Mark trusted"} okText={trusted ? "No longer trusted" : "Marked trusted"} run={() => A.setTrusted(id, !trusted)} />
      {suspended ? (
        <Act label="Lift suspension" okText="Suspension lifted" run={async () =>
          (await askConfirm({ title: `Lift the suspension on ${name}?`, body: "Its live jobs show on Ocelot again.", confirm: "Lift suspension" })) ? A.unsuspendCompany(id) : null} />
      ) : (
        <Act label="Suspend company" variant="danger" okText="Company suspended" run={async () => {
          const reason = await askText({ title: `Suspend ${name}`, label: "Reason (kept in the audit log)", confirm: "Suspend company" });
          return reason ? A.suspendCompany(id, reason) : null;
        }} />
      )}
    </div>
  );
}

export function PersonActions({ id, email, banned }: { id: string; email: string; banned: boolean }) {
  return banned ? (
    <Act label="Lift suspension" okText="They can sign in again" run={async () =>
      (await askConfirm({ title: `Let ${email} sign in again?`, confirm: "Lift suspension" })) ? A.unsuspendPerson(id) : null} />
  ) : (
    <Act label="Suspend sign-in" variant="danger" okText="Sign-in suspended" run={async () => {
      const reason = await askText({ title: `Suspend ${email}`, label: "Reason (kept in the audit log)", confirm: "Suspend sign-in" });
      return reason ? A.suspendPerson(id, reason) : null;
    }} />
  );
}

export function RetryTask({ id }: { id: number }) {
  return <Act label="Retry" okText="Queued again" run={() => A.retryTask(id)} />;
}

export function ReportActions({ id }: { id: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Act label="Actioned" okText="Marked actioned" run={async () => {
        const note = await askText({ title: "What did you do?", label: "Note (kept in the audit log)", confirm: "Mark actioned" });
        return note ? A.handleReport(id, "actioned", note) : null;
      }} />
      <Act label="Dismiss" okText="Dismissed" run={async () =>
        (await askConfirm({ title: "Dismiss this report?", body: "Nothing needs to change.", confirm: "Dismiss" })) ? A.handleReport(id, "dismissed", "") : null} />
    </div>
  );
}

export function PaymentsSwitch({ on }: { on: boolean }) {
  return on ? (
    <Act label="Turn payments off" okText="Payments are off" run={async () =>
      (await askConfirm({ title: "Turn payments off?", body: "New jobs go to review without a listing credit.", confirm: "Turn off", danger: true })) ? A.setPayments(false) : null} />
  ) : (
    <Act label="Turn payments on" variant="secondary" okText="Payments are on" run={async () =>
      (await askConfirm({ title: "Turn payments on?", body: "New jobs need a listing credit to go to review.", confirm: "Turn on" })) ? A.setPayments(true) : null} />
  );
}

export function GrantCredits({ orgId, name }: { orgId: string; name: string }) {
  return (
    <Act label="Give founding credits" okText="Credits added" run={async () => {
      const n = await askText({ title: `Founding credits for ${name}`, label: "How many (1 to 20)", initial: "1", confirm: "Give credits" });
      return n ? A.grantCredits(orgId, Number(n)) : null;
    }} />
  );
}

export function RefundOrder({ id, what }: { id: string; what: string }) {
  return (
    <Act label="Refund" okText="Refunded" run={async () =>
      (await askConfirm({ title: `Refund ${what}?`, body: "Stripe returns the money. The credit is removed and the job goes back to draft.", confirm: "Refund", danger: true })) ? A.refundOrder(id) : null} />
  );
}
