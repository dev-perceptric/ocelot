import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Logs out, then goes home, or to /login?next=... when a page asks (e.g. an invite for another email).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const form = await request.formData().catch(() => null);
  const next = safeNext(form?.get("next"), "");
  const to = next ? `/login?next=${encodeURIComponent(next)}` : "/";
  return NextResponse.redirect(new URL(to, process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin), 303);
}
