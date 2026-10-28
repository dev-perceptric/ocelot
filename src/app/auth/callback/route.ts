import { NextResponse, type NextRequest } from "next/server";
import { afterSignIn, safeNext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// The login link and Google land here. Swap the code for a session, then go on: the first-run question
// for new people, else where they were headed.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${base}${await afterSignIn(supabase, next)}`);
  }
  const kind = searchParams.get("error") ? "google" : "link";
  return NextResponse.redirect(`${base}/login?error=${kind}&next=${encodeURIComponent(next)}`);
}
