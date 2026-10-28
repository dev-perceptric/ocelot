// The Ocelot worker. Every minute: close jobs past their end date, then run due tasks from jobs_queue.
// Talks to Supabase over its REST API with the service role key, so it needs no packages.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY (for email), EMAIL_FROM.

import { pathToFileURL } from "node:url";

// A task fails for good (no more retries) when trying again can't help.
export class FinalError extends Error {}

export function makeWorker({ url, key, resendKey, from = "Ocelot <hello@joinocelot.com>", fetchImpl = fetch, log = console }) {
  const rest = (path, init = {}) =>
    fetchImpl(`${url}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers },
    });

  async function rpc(name, args = {}) {
    const res = await rest(`rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
    if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async function logEmail(row) {
    const res = await rest("email_log", { method: "POST", body: JSON.stringify(row), headers: { Prefer: "return=minimal" } });
    if (!res.ok) log.error(`email_log insert failed: ${res.status}`);
  }

  // One handler per task kind. Throw to retry later (backs off, stops after 5 tries); throw FinalError to stop now.
  const handlers = {
    async email(p) {
      if (!resendKey) throw new Error("RESEND_API_KEY is not set");
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: p.to, subject: p.subject, html: p.html, text: p.text, headers: p.headers ?? {} }),
      });
      const body = await res.text();
      if (!res.ok) {
        const message = `resend ${res.status} ${body.slice(0, 300)}`;
        // 4xx means the email itself is wrong (bad address, bad content); only rate limits are worth retrying.
        const final = res.status >= 400 && res.status < 500 && res.status !== 429;
        if (final) await logEmail({ user_id: p.user_id ?? null, to_email: p.to, kind: p.kind ?? "email", status: "failed", error: message });
        throw final ? new FinalError(message) : new Error(message);
      }
      let id = null;
      try { id = JSON.parse(body).id ?? null; } catch {}
      await logEmail({ user_id: p.user_id ?? null, to_email: p.to, kind: p.kind ?? "email", status: "sent", resend_id: id });
    },
  };

  async function tick() {
    const expired = await rpc("expire_jobs");
    if (expired) log.log(`expired ${expired} job(s)`);

    const tasks = (await rpc("claim_queue", { p_limit: 10 })) ?? [];
    for (const t of tasks) {
      const handler = handlers[t.kind];
      try {
        if (!handler) throw new FinalError(`no handler for ${t.kind}`);
        await handler(t.payload);
        await rpc("finish_queue", { p_id: t.id });
      } catch (err) {
        const final = err instanceof FinalError || t.attempts >= 5;
        log.error(`task ${t.id} (${t.kind}) failed${final ? " for good" : ""}:`, err.message);
        await rpc("finish_queue", { p_id: t.id, p_error: String(err.message).slice(0, 500), p_final: final });
      }
    }
    return tasks.length;
  }

  return { tick, handlers };
}

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const worker = makeWorker({ url, key, resendKey: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM });
  const tickMs = Number(process.env.TICK_MS ?? 60_000);

  let stopping = false;
  process.on("SIGTERM", () => { stopping = true; });
  process.on("SIGINT", () => { stopping = true; });

  console.log("ocelot worker started");
  while (!stopping) {
    try {
      await worker.tick();
    } catch (err) {
      console.error("tick failed:", err.message);
    }
    for (let waited = 0; waited < tickMs && !stopping; waited += 1000) await new Promise((r) => setTimeout(r, 1000));
  }
  console.log("ocelot worker stopped");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
