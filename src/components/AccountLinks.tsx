"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

// Log in and Sign up for visitors, Dashboard (their own workspace) for people signed in. Read in the browser from the sign-in cookie, so
// public pages stay the same for everyone and can be cached. Hidden (not removed) until known, so nothing jumps.
export function AccountLinks() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_, session) => setSignedIn(Boolean(session)));
    return () => data.subscription.unsubscribe();
  }, []);

  if (signedIn) return <Link href="/dashboard" prefetch={false} className="px-2 py-2 hover:underline">Dashboard</Link>;
  return (
    <span className={`flex items-center gap-1 sm:gap-3 ${signedIn === null ? "invisible" : ""}`}>
      <Link href="/login" className="px-2 py-2 hover:underline">Log in</Link>
      <Link href="/signup"
        className="hidden min-h-10 items-center whitespace-nowrap bg-ink px-4 text-surface hover:bg-ink/85 rounded-[var(--radius-control)] sm:inline-flex">
        Sign up
      </Link>
    </span>
  );
}
