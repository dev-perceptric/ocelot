import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { AcceptForm } from "./AcceptForm";

export const metadata: Metadata = { title: "Team invite", robots: { index: false } };
export const dynamic = "force-dynamic";

const ROLE: Record<string, string> = { admin: "an admin", member: "a member", recruiter: "a recruiter" };
const CLOSED: Record<string, string> = {
  accepted: "This invite was already used.",
  revoked: "This invite was cancelled.",
  expired: "This invite has expired. Ask for a new one.",
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { supabase, user } = await currentUser();
  if (!user) redirect(`/login?next=/invite/${encodeURIComponent(token)}`);
  // A link is for a company team or an agency team; the token says which.
  const { data } = await supabase.rpc("invite_preview", { p_token: token });
  const company = data?.[0];
  const { data: agencyData } = company ? { data: null } : await supabase.rpc("agency_invite_preview", { p_token: token });
  const a = agencyData?.[0];
  const kind: "company" | "agency" = a ? "agency" : "company";
  const inv = company ?? (a ? { ...a, company: a.agency } : undefined);

  let body: React.ReactNode;
  if (!inv) body = <p className="text-body">This invite link isn&apos;t valid. Check you copied the whole link.</p>;
  else if (inv.status !== "open") body = <p className="text-body">{CLOSED[inv.status]}</p>;
  else if (inv.email !== user.email?.toLowerCase()) {
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-body">This invite was sent to <strong>{inv.email}</strong>, and you&apos;re signed in as <strong>{user.email}</strong>.</p>
        <form action="/auth/signout" method="post"><input type="hidden" name="next" value={`/invite/${token}`} /><button type="submit" className="font-bold underline">Log out and sign in as {inv.email}</button></form>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-6">
        <p className="text-body">
          {kind === "agency"
            ? <>{inv.inviter} invited you to join the agency <strong>{inv.company}</strong> as {ROLE[inv.role] ?? "a recruiter"}. You&apos;ll see the jobs and applicants of the agency&apos;s clients.</>
            : <>{inv.inviter} invited you to join <strong>{inv.company}</strong> as {ROLE[inv.role] ?? "a member"}. You&apos;ll see the company&apos;s jobs and applicants.</>}
        </p>
        <AcceptForm token={token} company={inv.company} kind={kind} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[560px] px-5 py-16 md:py-24">
      <h1 className="text-title font-bold">{inv && inv.status === "open" ? `Join ${inv.company}` : "Team invite"}</h1>
      <div className="mt-6">{body}</div>
      <Link href="/employer" className="mt-10 inline-block text-meta underline">Go to For employers</Link>
    </div>
  );
}
