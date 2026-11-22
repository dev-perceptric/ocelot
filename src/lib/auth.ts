import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseReady } from "@/lib/env";

// Only paths inside Ocelot, so a link can't send people to another site after login.
export function safeNext(next: unknown, fallback = "/app"): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}

// Where someone goes right after signing in: the first-run question if they haven't answered it, else where they were headed.
export async function afterSignIn(supabase: SupabaseClient<Database>, next: string): Promise<string> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return "/login";
  const { data: profile } = await supabase.from("profiles").select("intent").eq("id", user.user.id).maybeSingle();
  if (!profile?.intent) {
    // Someone signing up on their way to post a job is hiring: no need to ask.
    if (next.startsWith("/employer")) {
      await supabase.from("profiles").update({ intent: "employer" }).eq("id", user.user.id);
      return next;
    }
    return `/welcome?next=${encodeURIComponent(next)}`;
  }
  // Job search and hiring are separate workspaces: with nowhere in particular to go, each person lands in their own.
  if (next === "/app" && profile.intent === "employer") return "/employer";
  return next;
}

// The signed-in home for someone: hiring for employers, job search for everyone else.
export async function homeFor(supabase: SupabaseClient<Database>): Promise<string> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return "/login";
  const { data: profile } = await supabase.from("profiles").select("intent").eq("id", user.user.id).maybeSingle();
  return profile?.intent === "employer" ? "/employer" : "/app";
}

// The Google button shows only once Google is switched on in Supabase. Asked at most every 5 minutes.
export async function googleEnabled(): Promise<boolean> {
  if (!supabaseReady) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      next: { revalidate: 300 },
    });
    if (!res.ok) return false;
    const settings = (await res.json()) as { external?: { google?: boolean } };
    return Boolean(settings.external?.google);
  } catch {
    return false;
  }
}

// The public address of this request: localhost while developing, the site address everywhere else.
export function originFrom(host: string | null, siteUrl: string): string {
  return host && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? `http://${host}` : siteUrl;
}
