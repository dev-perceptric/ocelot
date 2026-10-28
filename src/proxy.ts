import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Keeps the login fresh on every page, and sends signed-out people from private areas to /login.
const PRIVATE = ["/app", "/employer", "/admin", "/welcome", "/invite"];

export async function proxy(request: NextRequest) {
  // One address for search engines: www.joinocelot.com goes to joinocelot.com.
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0].trim();
  if (host.startsWith("www.")) {
    const to = request.nextUrl.clone();
    to.host = host.slice(4);
    to.protocol = "https:";
    to.port = "";
    return NextResponse.redirect(to, 308);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  if (!data.user && PRIVATE.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/((?!api/health|_next/|favicon\\.ico|icon|apple-icon|robots\\.txt|sitemap\\.xml|.*\\.[a-zA-Z0-9]+$).*)"],
};
