import { after, NextResponse, type NextRequest } from "next/server";
import { runAlerts, runDigests, runReminders } from "@/lib/cron";
import { checkCronToken } from "@/lib/cronToken";
import { runSources } from "@/lib/ats/sync";
import { runDiscovery } from "@/lib/ats/discover";
import { runLogos } from "@/lib/ats/logo";
import { createAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// One board run at a time on this machine; a run that's still going makes the next call skip boards.
let boardsBusy = false;

// The worker calls this every hour with its key. Emails are queued before answering. Job boards (sync,
// discovery, then logos) run after the answer, for up to about 6 minutes, so the worker's call stays short.
export async function POST(req: NextRequest) {
  // The worker's one-time pass from the database, or the older key made from the server secret.
  const header = req.headers.get("authorization") ?? "";
  const pass = header.replace(/^Bearer /, "");
  const db = createAdmin();
  const allowed = checkCronToken(header, process.env.SUPABASE_SERVICE_ROLE_KEY)
    || (/^[0-9a-f]{32,128}$/.test(pass) && (await db.rpc("take_cron_pass", { p_token: pass })).data === true);
  if (!allowed) return NextResponse.json({ error: "not allowed" }, { status: 401 });
  const out: Record<string, number | string> = {};
  for (const [name, run] of [["alerts", runAlerts], ["reminders", runReminders], ["digests", runDigests]] as const) {
    try { out[name] = await run(); } catch (e) {
      console.error(`cron ${name} failed`, e);
      out[name] = "failed";
    }
  }
  if (boardsBusy) out.boards = "busy";
  else {
    boardsBusy = true;
    out.boards = "started";
    after(async () => {
      try {
        const synced = await runSources().catch((e) => { console.error("cron sources failed", e); return -1; });
        const found = await runDiscovery().catch((e) => { console.error("cron discovery failed", e); return -1; });
        const logos = await runLogos().catch((e) => { console.error("cron logos failed", e); return -1; });
        const done = `boards: ${synced} synced, ${found} found, ${logos} logos`;
        console.log(done);
        await db.from("app_settings").update({ last_cron_result: `${JSON.stringify(out)}; ${done}` }).eq("id", true);
      } finally {
        boardsBusy = false;
      }
    });
  }
  await db.from("app_settings").update({ last_cron_at: new Date().toISOString(), last_cron_result: JSON.stringify(out) }).eq("id", true);
  return NextResponse.json(out);
}
