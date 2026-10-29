import { NextResponse, type NextRequest } from "next/server";
import { runAlerts, runDigests, runReminders } from "@/lib/cron";
import { checkCronToken } from "@/lib/cronToken";

export const dynamic = "force-dynamic";

// The worker calls this every hour with its key. Each part runs on its own, so one failing doesn't stop the others.
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
  return NextResponse.json(out);
}
