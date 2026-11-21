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

// ---------- Email and password ----------
// Ocelot has always let people in with an emailed code. A password is one more way in: set it when signing up, or
// with Forgot password (which also works for people who only ever used a code).

export type PasswordState = { error?: string; email?: string };
export type SignupState = { step: "form" | "code"; email?: string; next?: string; error?: string; fields?: { email?: string; password?: string } };

export async function logInWithPassword(_: PasswordState, form: FormData): Promise<PasswordState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));
  if (!EMAIL.test(email)) return { email, error: "Enter a valid email address." };
  if (!password) return { email, error: "Enter your password." };
  if (!supabaseReady) return { email, error: "Login isn't set up yet." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/not confirmed/i.test(error.message)) return { email, error: "Finish signing up first: enter the code we emailed you, or log in with a code instead." };
    if (/rate limit|security purposes/i.test(error.message)) return { email, error: "Too many tries. Wait a minute, then try again." };
    return { email, error: "That email and password don't match. If you've only used a code before, set a password with Forgot password." };
  }
  redirect(await afterSignIn(supabase, next));
}

export async function signUpWithPassword(_: SignupState, form: FormData): Promise<SignupState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));
  if (!EMAIL.test(email)) return { step: "form", next, fields: { email: "Enter a valid email address." } };
  if (password.length < 8) return { step: "form", next, email, fields: { password: "Use at least 8 characters." } };
  if (!supabaseReady) return { step: "form", next, email, error: "Sign up isn't set up yet." };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) {
    if (error.code === "user_already_exists" || /already registered/i.test(error.message)) return { step: "form", next, email, error: "There's already an account with this email. Log in instead, or reset your password." };
    const wait = /security purposes|rate limit/i.test(error.message);
    return { step: "form", next, email, error: wait ? "Too many tries. Wait a minute, then try again." : /password/i.test(error.message) ? error.message : "That didn't work. Try again." };
  }
  // An email that already has an account comes back with no identities, and no email is sent.
  if (data.user && data.user.identities?.length === 0) return { step: "form", next, email, error: "There's already an account with this email. Log in instead, or reset your password." };
  // Sign-in servers that don't ask for an email check sign the person in at once.
  if (data.session) redirect(await afterSignIn(supabase, next));
  return { step: "code", email, next };
}

export async function confirmSignup(state: SignupState, form: FormData): Promise<SignupState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const token = String(form.get("code") ?? "").replace(/\s+/g, "");
  const next = safeNext(form.get("next"));
  if (!/^\d{6,10}$/.test(token)) return { ...state, step: "code", email, next, error: "Enter the code from the email." };
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
  if (error) return { ...state, step: "code", email, next, error: "That code didn't work. Check it, or send a new one." };
  redirect(await afterSignIn(supabase, next));
}

export async function resendSignupCode(state: SignupState, form: FormData): Promise<SignupState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });
  return { ...state, step: "code", email, error: error ? "Wait a minute before asking for another code." : undefined };
}

export async function sendPasswordReset(_: PasswordState, form: FormData): Promise<PasswordState & { sent?: boolean }> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) return { email, error: "Enter a valid email address." };
  if (!supabaseReady) return { email, error: "Login isn't set up yet." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await origin()}/auth/callback?next=/reset-password` });
  if (error && /security purposes|rate limit/i.test(error.message)) return { email, error: "Wait a minute before asking for another email." };
  // The same answer whether or not the email has an account, so the form can't be used to check who has one.
  return { email, sent: true };
}

export async function setNewPassword(_: PasswordState, form: FormData): Promise<PasswordState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "This link has expired. Ask for a new one." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: /different from the old/i.test(error.message) ? "Choose a password you haven't used here before." : "That didn't save. Try again." };
  redirect(await afterSignIn(supabase, "/app"));
}
