import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { readFilters } from "@/lib/search";
import { seoPath } from "@/lib/seo";

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

  // A Find jobs search that has a page of its own (/jobs?category=sales&level=senior) moves there for good, before
  // anything is sent, so search engines see one address. The page number and an open job (?job=) come along.
  if (request.nextUrl.pathname === "/jobs" && request.nextUrl.search) {
    const sp = request.nextUrl.searchParams;
    const params: Record<string, string[]> = {};
    sp.forEach((v, k) => { (params[k] ??= []).push(v); });
    const clean = seoPath(readFilters(params));
    if (clean) {
      const to = request.nextUrl.clone();
      to.pathname = clean;
      const keep = new URLSearchParams();
      const page = Number(sp.get("page"));
      if (page > 1) keep.set("page", String(Math.min(1000, Math.floor(page))));
      if (sp.get("job")) keep.set("job", sp.get("job")!);
      to.search = keep.size ? `?${keep}` : "";
      return NextResponse.redirect(to, 308);
    }
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
    // An invite is often for someone new: the emailed code signs in or creates the account in one step.
    login.search = `?${pathname.startsWith("/invite/") ? "method=code&" : ""}next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/((?!api/health|_next/|favicon\\.ico|icon|apple-icon|robots\\.txt|sitemap\\.xml|.*\\.[a-zA-Z0-9]+$).*)"],
};
