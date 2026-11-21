import type { Metadata } from "next";
import Link from "next/link";
import { safeNext } from "@/lib/auth";
import { AuthShell } from "../login/AuthShell";
import { ForgotForm } from "../login/PasswordForms";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false } };

export default async function ForgotPassword({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  return (
    <AuthShell next={next}>
      <h1 className="text-title font-bold">Forgot your password?</h1>
      <p className="mt-2 text-body text-muted">Enter your email and we&apos;ll send you a link to set a new one. This also works if you&apos;ve only logged in with a code so far.</p>
      <ForgotForm next={next} />
      <p className="mt-6 text-meta"><Link href="/login" className="underline">Back to log in</Link></p>
    </AuthShell>
  );
}
