// Signed one-click unsubscribe links. The signature proves the link came from Ocelot for this person and
// this kind of email, so it works without signing in. Plain functions so tests can load them.

import { createHmac, timingSafeEqual } from "node:crypto";

export const PREFS = ["application_updates", "new_applicants", "job_alerts", "weekly_digest", "product_news"] as const;
export type Pref = (typeof PREFS)[number];

// The signing key comes from a server secret, so nothing new has to be set up.
export const signingKey = (serverSecret: string) => createHmac("sha256", serverSecret).update("ocelot-unsubscribe-v1").digest();

export function sign(key: Buffer, userId: string, pref: Pref): string {
  return createHmac("sha256", key).update(`${userId}.${pref}`).digest("base64url").slice(0, 32);
}

export function verify(key: Buffer, userId: string, pref: string, token: string): pref is Pref {
  if (!(PREFS as readonly string[]).includes(pref) || !/^[0-9a-f-]{36}$/.test(userId)) return false;
  const want = Buffer.from(sign(key, userId, pref as Pref));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

// The page people open from the email footer (asks before turning anything off).
export function unsubscribeUrl(siteUrl: string, key: Buffer, userId: string, pref: Pref): string {
  return `${siteUrl}/unsubscribe?u=${userId}&p=${pref}&t=${sign(key, userId, pref)}`;
}

// The address mail apps call for their own Unsubscribe button (RFC 8058 one-click, a POST with no page).
export function oneClickUrl(siteUrl: string, key: Buffer, userId: string, pref: Pref): string {
  return `${siteUrl}/api/unsubscribe?u=${userId}&p=${pref}&t=${sign(key, userId, pref)}`;
}
