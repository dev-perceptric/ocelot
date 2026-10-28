import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui";
import { checkLink, PREF_LABEL } from "@/lib/email/optout";
import { PREFS, type Pref } from "@/lib/email/unsubscribe";

export const metadata: Metadata = { title: "Email choices", robots: { index: false } };
export const dynamic = "force-dynamic";

type Q = { u?: string; p?: string; t?: string; done?: string; failed?: string };

export default async function Unsubscribe({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const isPref = (v?: string): v is Pref => Boolean(v && (PREFS as readonly string[]).includes(v));

  let body: React.ReactNode;
  if (isPref(q.done)) {
    body = <p className="text-body" role="status">You won&apos;t get {PREF_LABEL[q.done]} anymore.</p>;
  } else if (isPref(q.failed)) {
    body = <p className="text-body text-danger" role="alert">That didn&apos;t save. Open the link from the email again.</p>;
  } else {
    const pref = checkLink(q.u ?? null, q.p ?? null, q.t ?? null);
    body = pref ? (
      <form method="post" action={`/api/unsubscribe?u=${q.u}&p=${q.p}&t=${q.t}&from=page`} className="flex flex-col items-start gap-6">
        <p className="text-body">Stop getting {PREF_LABEL[pref]}?</p>
        <Button type="submit">Unsubscribe</Button>
      </form>
    ) : (
      <p className="text-body">This link isn&apos;t valid. You can change your emails in settings.</p>
    );
  }

  return (
    <div className="mx-auto max-w-[560px] px-5 py-16 md:py-24">
      <h1 className="text-title font-bold">Email choices</h1>
      <div className="mt-6">{body}</div>
      <Link href="/app/settings" className="mt-10 inline-block text-meta underline">All email settings</Link>
    </div>
  );
}
