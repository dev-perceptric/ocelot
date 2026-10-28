import "server-only";
import { SITE_URL } from "@/lib/env";
import { createAdmin } from "@/lib/supabase/server";
import type { Email } from "./layout";
import { oneClickUrl, signingKey, unsubscribeUrl } from "./unsubscribe";

// Puts an email on the queue; the worker sends it through Resend and retries if Resend is down.
// Nothing sends email inside a page request. Emails a person turned off are logged as skipped instead.
export async function queueEmail(o: { to: string; userId?: string | null; kind: string; email: Email }): Promise<"queued" | "skipped"> {
  const db = createAdmin();
  const { email } = o;
  const headers: Record<string, string> = {};
  let { html, text } = email;

  if (email.pref) {
    if (!o.userId) throw new Error(`${o.kind} needs a userId: it can be turned off`);
    const { data: prefs } = await db.from("notification_prefs").select("*").eq("user_id", o.userId).maybeSingle();
    const defaults = { application_updates: true, job_alerts: true, weekly_digest: false, product_news: false };
    if (!(prefs?.[email.pref] ?? defaults[email.pref])) {
      await db.from("email_log").insert({ user_id: o.userId, to_email: o.to, kind: o.kind, status: "skipped" });
      return "skipped";
    }
    const key = signingKey(process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const url = unsubscribeUrl(SITE_URL, key, o.userId, email.pref);
    headers["List-Unsubscribe"] = `<${oneClickUrl(SITE_URL, key, o.userId, email.pref)}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    // The template leaves a marker for the link, filled in here where the key lives.
    html = html.replaceAll("{{unsubscribe}}", url);
    text = text.replaceAll("{{unsubscribe}}", url);
  }

  const { error } = await db.from("jobs_queue").insert({
    kind: "email",
    payload: { to: o.to, user_id: o.userId ?? null, kind: o.kind, subject: email.subject, html, text, headers },
  });
  if (error) throw error;
  return "queued";
}
