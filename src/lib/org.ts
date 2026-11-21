import "server-only";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/supabase/server";
import type { AgencyRole } from "@/lib/agency";

export type Role = "owner" | "admin" | "member";
export type MyOrg = {
  id: string; name: string; slug: string; logo_url: string | null;
  role: Role;              // what this person can do in the company, through its team or its agency
  teamRole: Role | null;   // their role on the company's own team, or null when they work on it only through an agency
  agency: { id: string; name: string } | null; // the agency that manages the company, if any
};
export type MyAgency = { id: string; name: string; slug: string; logo_url: string | null; role: AgencyRole; suspended: boolean };

export const ORG_COOKIE = "ocelot_org";
export const AGENCY_COOKIE = "ocelot_agency";

const RANK: Record<Role, number> = { member: 0, admin: 1, owner: 2 };
// Agency owners and admins act as company admins, recruiters as members (supabase/migrations/039_agencies.sql).
const viaAgency = (r: AgencyRole): Role => (r === "recruiter" ? "member" : "admin");

type OrgRow = { id: string; name: string; slug: string; logo_url: string | null; agency_id: string | null };

// The companies and agencies this person belongs to, and the company and agency they're working in (remembered in
// cookies, always checked against their memberships, so a cookie alone grants nothing). Companies include the
// clients of their agencies.
export async function myOrgs() {
  const { supabase, user } = await currentUser();
  if (!user) return { supabase, user, orgs: [] as MyOrg[], current: null as MyOrg | null, agencies: [] as MyAgency[], agency: null as MyAgency | null };

  const [{ data: team }, { data: staff }] = await Promise.all([
    supabase.from("org_members").select("role, org:orgs(id, name, slug, logo_url, agency_id)").eq("user_id", user.id).order("created_at"),
    supabase.from("agency_members").select("role, agency:agencies(id, name, slug, logo_url, suspended_at)").eq("user_id", user.id).order("created_at"),
  ]);
  const agencies: MyAgency[] = (staff ?? []).filter((s) => s.agency).map((s) => {
    const a = s.agency as unknown as { id: string; name: string; slug: string; logo_url: string | null; suspended_at: string | null };
    return { id: a.id, name: a.name, slug: a.slug, logo_url: a.logo_url, role: s.role as AgencyRole, suspended: a.suspended_at !== null };
  });
  const { data: clients } = agencies.length
    ? await supabase.from("orgs").select("id, name, slug, logo_url, agency_id").in("agency_id", agencies.map((a) => a.id)).order("name")
    : { data: [] as OrgRow[] };

  const agencyName = new Map(agencies.map((a) => [a.id, a.name]));
  const byId = new Map<string, MyOrg>();
  for (const m of team ?? []) {
    const o = m.org as unknown as OrgRow | null;
    if (!o) continue;
    byId.set(o.id, { id: o.id, name: o.name, slug: o.slug, logo_url: o.logo_url, role: m.role as Role, teamRole: m.role as Role,
      agency: o.agency_id ? { id: o.agency_id, name: agencyName.get(o.agency_id) ?? "Your agency" } : null });
  }
  for (const o of (clients ?? []) as OrgRow[]) {
    const a = agencies.find((x) => x.id === o.agency_id);
    if (!a) continue;
    const role = viaAgency(a.role);
    const had = byId.get(o.id);
    if (had) { if (RANK[role] > RANK[had.role]) had.role = role; had.agency = { id: a.id, name: a.name }; continue; }
    byId.set(o.id, { id: o.id, name: o.name, slug: o.slug, logo_url: o.logo_url, role, teamRole: null, agency: { id: a.id, name: a.name } });
  }
  const orgs = [...byId.values()];

  const jar = await cookies();
  const wanted = jar.get(ORG_COOKIE)?.value;
  const current = orgs.find((o) => o.id === wanted) ?? orgs[0] ?? null;
  const wantedAgency = jar.get(AGENCY_COOKIE)?.value;
  const agency = agencies.find((a) => a.id === wantedAgency)
    ?? agencies.find((a) => a.id === current?.agency?.id) ?? agencies[0] ?? null;
  return { supabase, user, orgs, current, agencies, agency };
}

export const canManage = (role: Role | undefined) => role === "owner" || role === "admin";
export const canManageAgency = (role: AgencyRole | undefined) => role === "owner" || role === "admin";

export const COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 } as const;
