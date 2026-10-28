// The Ocelot worker. Every minute: close jobs past their end date, then run due tasks from jobs_queue.
// Talks to Supabase over its REST API with the service role key, so it needs no packages.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY (for email), EMAIL_FROM.

const URL_ = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM ?? "Ocelot <hello@joinocelot.com>";
const TICK_MS = Number(process.env.TICK_MS ?? 60_000);

if (!URL_ || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

async function rpc(name, args = {}) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// One handler per task kind. A handler throws to retry later (the queue backs off and stops after 5 tries).
const HANDLERS = {
  async email({ to, subject, html, text }) {
    if (!RESEND) throw new Error("RESEND_API_KEY is not set");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, html, text }),
    });
    if (!res.ok) throw new Error(`resend ${res.status} ${await res.text()}`);
  },
};

async function tick() {
  const expired = await rpc("expire_jobs");
  if (expired) console.log(`expired ${expired} job(s)`);

  const tasks = (await rpc("claim_queue", { p_limit: 10 })) ?? [];
  for (const t of tasks) {
    const handler = HANDLERS[t.kind];
    try {
      if (!handler) throw new Error(`no handler for ${t.kind}`);
      await handler(t.payload);
      await rpc("finish_queue", { p_id: t.id });
    } catch (err) {
      console.error(`task ${t.id} (${t.kind}) failed:`, err.message);
      await rpc("finish_queue", { p_id: t.id, p_error: String(err.message).slice(0, 500) });
    }
  }
}

let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

console.log("ocelot worker started");
while (!stopping) {
  try {
    await tick();
  } catch (err) {
    console.error("tick failed:", err.message);
  }
  for (let waited = 0; waited < TICK_MS && !stopping; waited += 1000) await new Promise((r) => setTimeout(r, 1000));
}
console.log("ocelot worker stopped");
