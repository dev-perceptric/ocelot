"use server";

import { headers } from "next/headers";
import { originFrom } from "@/lib/auth";
import { SITE_URL } from "@/lib/env";
import { currentUser } from "@/lib/supabase/server";

export type EmailState = { error?: string; sentTo?: string };

export async function changeEmail(_: EmailState, form: FormData): Promise<EmailState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Your session ended. Log in again." };
  if (email === user.email) return { error: "That's already your email." };
  const h = await headers();
  const origin = originFrom(h.get("x-forwarded-host") ?? h.get("host"), SITE_URL);
  const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: `${origin}/auth/callback?next=/app/settings` });
  if (error) return { error: /already/i.test(error.message) ? "Another account uses that email." : error.message };
  return { sentTo: email };
}

const PREFS = ["application_updates", "new_applicants", "job_alerts", "weekly_digest", "product_news"] as const;
export type Pref = (typeof PREFS)[number];

export async function setPref(key: Pref, on: boolean): Promise<{ ok: boolean }> {
  if (!PREFS.includes(key)) return { ok: false };
  const { supabase, user } = await currentUser();
  if (!user) return { ok: false };
  const { error } = await supabase
    .from("notification_prefs")
    .upsert({ user_id: user.id, ...({ [key]: on } as Partial<Record<Pref, boolean>>), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return { ok: !error };
}
