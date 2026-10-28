"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL, supabaseReady } from "@/lib/env";

export type LoginState = { sent?: string; error?: string };

// Only paths inside Ocelot, so a link can't send people to another site after login.
export const safeNext = async (next: unknown) =>
  typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/app";

export async function sendLink(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  if (!supabaseReady) return { error: "Login isn't set up yet." };

  const host = (await headers()).get("x-forwarded-host") ?? (await headers()).get("host");
  const origin = host?.startsWith("localhost") ? `http://${host}` : SITE_URL;
  const next = await safeNext(form.get("next"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) return { error: error.message };
  return { sent: email };
}
