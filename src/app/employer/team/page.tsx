import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { myOrgs } from "@/lib/org";
import { TeamView } from "../TeamView";
import { cancelInvite, changeRole, invite, removeMember } from "./actions";
import { AgencyPanel } from "./AgencyPanel";

export const metadata: Metadata = { title: "Team" };
export const dynamic = "force-dynamic";

const ROLES = [
  { value: "owner", label: "Owner", hint: "everything" },
  { value: "admin", label: "Admin", hint: "also company settings and team" },
  { value: "member", label: "Member", hint: "jobs and applicants" },
];

export default async function TeamPage() {
  const { supabase, user, current } = await myOrgs();
  if (!user || !current) redirect("/employer");
  const manage = current.teamRole === "owner" || current.teamRole === "admin";
  const [{ data: members }, { data: invites }, { data: requests }] = await Promise.all([
    supabase.rpc("team_members", { p_org: current.id }),
    manage
      ? supabase.from("org_invites").select("id, email, role, expires_at")
          .eq("org_id", current.id).is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    manage
      ? supabase.from("agency_client_requests").select("id, agency_name, created_at").eq("org_id", current.id).is("answered_at", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const intro = current.teamRole === null ? (
    <p className="-mt-6 text-body text-muted">
      You work on {current.name} through {current.agency?.name ?? "your agency"}. {current.name}&apos;s own team manages this list.
    </p>
  ) : (
    <AgencyPanel company={current.name} agency={current.agency} isOwner={current.teamRole === "owner"} canSee={manage} requests={requests ?? []} />
  );

  return (
    <TeamView
      me={user.id}
      myRole={current.teamRole}
      place={current.name}
      kind="company"
      access="jobs and applicants"
      roles={ROLES}
      members={members ?? []}
      invites={invites ?? []}
      actions={{ invite, cancelInvite, changeRole, removeMember }}
      intro={intro}
    />
  );
}
