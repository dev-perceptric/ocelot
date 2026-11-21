import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { afterSignIn, googleEnabled, safeNext } from "@/lib/auth";
import { currentUser } from "@/lib/supabase/server";
import { AuthShell, GoogleSignIn } from "../login/AuthShell";
import { SignupForm } from "../login/PasswordForms";

export const metadata: Metadata = { title: "Sign up", description: "Create a free Ocelot account to save jobs and track every application.", alternates: { canonical: "/signup" } };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const { supabase, user } = await currentUser();
  if (user) redirect(await afterSignIn(supabase, next));
  const google = await googleEnabled();
  const keep = next !== "/app" ? `next=${encodeURIComponent(next)}` : "";
  return (
    <AuthShell next={next}>
      <h1 className="text-title font-bold">Create your account</h1>
      <p className="mt-2 text-body text-muted">
        Already have an account? <Link href={`/login${keep ? `?${keep}` : ""}`} className="font-bold text-ink underline">Log in</Link>
      </p>
      {google ? <GoogleSignIn next={next} /> : <div className="mt-8" />}
      <SignupForm next={next} />
      <p className="mt-6 text-meta">
        <Link href={`/login?method=code${keep ? `&${keep}` : ""}`} className="underline">Rather not use a password? Email me a code</Link>
      </p>
    </AuthShell>
  );
}
