import { NextResponse, type NextRequest } from "next/server";
import { checkLink, turnOff } from "@/lib/email/optout";

// One-click unsubscribe from a mail app's own button (RFC 8058), and the form on /unsubscribe.
export async function POST(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const u = q.get("u");
  const pref = checkLink(u, q.get("p"), q.get("t"));
  if (!pref || !u) return NextResponse.json({ ok: false }, { status: 400 });
  const ok = await turnOff(u, pref);
  // The page form wants to land back on the page; mail apps only read the status.
  if (q.get("from") === "page") {
    const back = new URL("/unsubscribe", request.nextUrl.origin);
    back.searchParams.set(ok ? "done" : "failed", pref);
    return NextResponse.redirect(new URL(back.pathname + back.search, process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin), 303);
  }
  return NextResponse.json({ ok }, { status: ok ? 200 : 500 });
}
