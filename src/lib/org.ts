import "server-only";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/supabase/server";

export type Role = "owner" | "admin" | "member";
export type MyOrg = { id: string; name: string; slug: string; logo_url: string | null; role: Role };

export const ORG_COOKIE = "ocelot_org";

// The companies this person belongs to, and the one they're working in (remembered in a cookie,
// always checked against their memberships, so the cookie alone grants nothing).
export async function myOrgs() {
  const { supabase, user } = await currentUser();
  if (!user) return { supabase, user, orgs: [] as MyOrg[], current: null };
  const { data } = await supabase
    .from("org_members")
    .select("role, org:orgs(id, name, slug, logo_url)")
    .eq("user_id", user.id)
    .order("created_at");
  const orgs = (data ?? [])
    .filter((m) => m.org)
    .map((m) => ({ ...(m.org as unknown as Omit<MyOrg, "role">), role: m.role as Role }));
  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const current = orgs.find((o) => o.id === wanted) ?? orgs[0] ?? null;
  return { supabase, user, orgs, current };
}

export const canManage = (role: Role | undefined) => role === "owner" || role === "admin";
