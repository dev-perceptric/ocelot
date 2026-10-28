import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui";
import { afterSignIn, googleEnabled, safeNext } from "@/lib/auth";
import { currentUser } from "@/lib/supabase/server";
import { signInWithGoogle } from "./actions";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

const ERRORS: Record<string, string> = {
  link: "That link has expired or was already used. Send a new email.",
  google: "Google sign-in didn't work. Try again, or use your email.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next: raw, error } = await searchParams;
  const next = safeNext(raw);
  const { supabase, user } = await currentUser();
  if (user) redirect(await afterSignIn(supabase, next));
  const google = await googleEnabled();

  return (
    <div className="mx-auto max-w-[440px] px-5 py-16 md:py-24">
      <h1 className="text-title font-bold">Log in or sign up</h1>
      {error && ERRORS[error] ? <p className="mt-4 text-meta text-danger" role="alert">{ERRORS[error]}</p> : null}
      {google ? (
        <form action={signInWithGoogle} className="mt-8">
          <input type="hidden" name="next" value={next} />
          <Button type="submit" variant="outline" className="w-full">
            <GoogleMark />
            Continue with Google
          </Button>
        </form>
      ) : null}
      {google ? (
        <div className="my-6 flex items-center gap-3 text-meta text-muted" aria-hidden>
          <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
        </div>
      ) : null}
      <div className={google ? "" : "mt-8"}>
        <LoginForm next={next} />
      </div>
    </div>
  );
}

function GoogleMark() {
  // Google's own colors, required by their brand rules for the sign-in button.
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />{/* ui-rules: allow */}
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />{/* ui-rules: allow */}
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />{/* ui-rules: allow */}
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />{/* ui-rules: allow */}
    </svg>
  );
}
