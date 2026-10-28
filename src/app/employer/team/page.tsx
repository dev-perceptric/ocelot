import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canManage, myOrgs, type Role } from "@/lib/org";
import { TeamView } from "./TeamView";

export const metadata: Metadata = { title: "Team" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const { supabase, user, current } = await myOrgs();
  if (!user || !current) redirect("/employer");
  const { data: members } = await supabase.rpc("team_members", { p_org: current.id });
  const { data: invites } = canManage(current.role)
    ? await supabase.from("org_invites").select("id, email, role, expires_at")
        .eq("org_id", current.id).is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <TeamView
      me={user.id}
      myRole={current.role}
      company={current.name}
      members={(members ?? []).map((m) => ({ ...m, role: m.role as Role }))}
      invites={invites ?? []}
    />
  );
}
