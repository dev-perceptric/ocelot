import { NextResponse, type NextRequest } from "next/server";
import { homeFor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// The site header's Dashboard link: hiring for employers, job search for everyone else.
export async function GET(request: NextRequest) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
  return NextResponse.redirect(`${base}${await homeFor(await createClient())}`);
}
