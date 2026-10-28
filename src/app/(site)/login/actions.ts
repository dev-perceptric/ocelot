"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { afterSignIn, originFrom, safeNext } from "@/lib/auth";
import { SITE_URL, supabaseReady } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { step: "email" | "code"; email?: string; next?: string; error?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function origin() {
  const h = await headers();
  return originFrom(h.get("x-forwarded-host") ?? h.get("host"), SITE_URL);
}

// Step 1: send an email with both a link and a code. The code works on any device.
export async function sendLink(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(form.get("next"));
  if (!EMAIL.test(email)) return { step: "email", next, error: "Enter a valid email address." };
  if (!supabaseReady) return { step: "email", next, error: "Login isn't set up yet." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) {
    const wait = /security purposes|rate limit/i.test(error.message);
    return { step: "email", next, error: wait ? "Too many tries. Wait a minute, then send a new email." : error.message };
  }
  return { step: "code", email, next };
}

// Step 2: the code from the email.
export async function verifyCode(state: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const token = String(form.get("code") ?? "").replace(/\s+/g, "");
  const next = safeNext(form.get("next"));
  if (!/^\d{6,10}$/.test(token)) return { ...state, step: "code", email, next, error: "Enter the code from the email." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { ...state, step: "code", email, next, error: "That code didn't work. Check it, or send a new email." };
  redirect(await afterSignIn(supabase, next));
}

export async function signInWithGoogle(form: FormData) {
  const next = safeNext(form.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect(`/login?error=google&next=${encodeURIComponent(next)}`);
  redirect(data.url);
}
