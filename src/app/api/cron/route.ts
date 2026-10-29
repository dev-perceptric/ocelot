import { after, NextResponse, type NextRequest } from "next/server";
import { runAlerts, runDigests, runReminders } from "@/lib/cron";
import { checkCronToken } from "@/lib/cronToken";
import { runSources } from "@/lib/ats/sync";
import { runDiscovery } from "@/lib/ats/discover";

export const dynamic = "force-dynamic";

// One board run at a time on this machine; a run that's still going makes the next call skip boards.
let boardsBusy = false;

// The worker calls this every hour with its key. Emails are queued before answering. Job boards (sync, then
// discovery) run after the answer, for up to about 4 minutes, so the worker's call stays short.
export async function POST(req: NextRequest) {
  if (!checkCronToken(req.headers.get("authorization"), process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    return NextResponse.json({ error: "not allowed" }, { status: 401 });
  }
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
        console.log(`boards: ${synced} synced, ${found} found`);
      } finally {
        boardsBusy = false;
      }
    });
  }
  return NextResponse.json(out);
}
