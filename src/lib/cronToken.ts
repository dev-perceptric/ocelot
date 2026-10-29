// The worker proves it's the worker when it calls /api/cron: a key made from the service role secret, which
// both apps already have, so nothing new needs setting up. scripts/worker.mjs makes the same key.

import { createHmac, timingSafeEqual } from "node:crypto";

export const cronToken = (serverSecret: string) => createHmac("sha256", serverSecret).update("ocelot-cron-v1").digest("hex");

export function checkCronToken(header: string | null, serverSecret: string | undefined): boolean {
  if (!header || !serverSecret) return false;
  const got = Buffer.from(header.replace(/^Bearer /, ""));
  const want = Buffer.from(cronToken(serverSecret));
  return got.length === want.length && timingSafeEqual(got, want);
}
