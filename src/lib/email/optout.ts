import "server-only";
import { createAdmin } from "@/lib/supabase/server";
import { signingKey, verify, type Pref } from "./unsubscribe";

export const PREF_LABEL: Record<Pref, string> = {
  application_updates: "updates on applications you send",
  new_applicants: "emails about new applicants",
  task_reminders: "task reminders",
  job_alerts: "alerts for searches you saved",
  weekly_digest: "the weekly jobs digest",
  product_news: "news about Ocelot",
};

export function checkLink(u: string | null, p: string | null, t: string | null): Pref | null {
  if (!u || !p || !t || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return verify(signingKey(process.env.SUPABASE_SERVICE_ROLE_KEY), u, p, t) ? (p as Pref) : null;
}

// The signed link already proved who this is, so the server turns the choice off on their behalf.
export async function turnOff(userId: string, pref: Pref): Promise<boolean> {
  const { error } = await createAdmin()
    .from("notification_prefs")
    .upsert({ user_id: userId, [pref]: false, updated_at: new Date().toISOString() } as { user_id: string }, { onConflict: "user_id" });
  return !error;
}
