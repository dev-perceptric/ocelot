import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { afterSignIn, googleEnabled, safeNext } from "@/lib/auth";
import { currentUser } from "@/lib/supabase/server";
import { AuthShell, GoogleSignIn } from "./AuthShell";
import { LoginForm } from "./LoginForm";
import { PasswordLogin } from "./PasswordForms";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

const ERRORS: Record<string, string> = {
  link: "That link has expired or was already used. Try again.",
  google: "Google sign-in didn't work. Try again, or use your email.",
};

// Log in with a password (the default) or with a code emailed to you (?method=code), which also creates an account.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; method?: string }> }) {
  const { next: raw, error, method } = await searchParams;
  const next = safeNext(raw);
  const { supabase, user } = await currentUser();
  if (user) redirect(await afterSignIn(supabase, next));
  const google = await googleEnabled();
  const keep = next !== "/app" ? `next=${encodeURIComponent(next)}` : "";
  const failed = error && ERRORS[error] ? <p className="mt-4 text-meta text-danger" role="alert">{ERRORS[error]}</p> : null;

  if (method === "code") {
    return (
      <AuthShell next={next}>
        <h1 className="text-title font-bold">Log in with a code</h1>
        <p className="mt-2 text-body text-muted">We&apos;ll email you a 6-digit code. New here? This creates your account.</p>
        {failed}
        <div className="mt-8"><LoginForm next={next} /></div>
        <p className="mt-6 text-meta"><Link href={`/login${keep ? `?${keep}` : ""}`} className="underline">Use a password instead</Link></p>
      </AuthShell>
    );
  }

  return (
    <AuthShell next={next}>
      <h1 className="text-title font-bold">Welcome back</h1>
      <p className="mt-2 text-body text-muted">
        New to Ocelot? <Link href={`/signup${keep ? `?${keep}` : ""}`} className="font-bold text-ink underline">Create an account</Link>
      </p>
      {failed}
      {google ? <GoogleSignIn next={next} /> : <div className="mt-8" />}
      <PasswordLogin next={next} />
      <p className="mt-6 text-meta">
        <Link href={`/login?method=code${keep ? `&${keep}` : ""}`} className="underline">Email me a sign-in code instead</Link>
      </p>
    </AuthShell>
  );
}
