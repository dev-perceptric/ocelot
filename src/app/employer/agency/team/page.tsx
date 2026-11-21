import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canManageAgency, myOrgs } from "@/lib/org";
import { TeamView } from "../../TeamView";
import { cancelStaffInvite, changeStaffRole, inviteStaff, removeStaff } from "../actions";

export const metadata: Metadata = { title: "Agency team" };
export const dynamic = "force-dynamic";

const ROLES = [
  { value: "owner", label: "Owner", hint: "everything" },
  { value: "admin", label: "Admin", hint: "also clients, agency settings and team" },
  { value: "recruiter", label: "Recruiter", hint: "clients' jobs and applicants" },
];

export default async function AgencyTeamPage() {
  const { supabase, user, agency } = await myOrgs();
  if (!user || !agency) redirect("/employer/agency");
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.rpc("agency_team", { p_agency: agency.id }),
    canManageAgency(agency.role)
      ? supabase.from("agency_invites").select("id, email, role, expires_at")
          .eq("agency_id", agency.id).is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <TeamView
      me={user.id}
      myRole={agency.role}
      place={agency.name}
      kind="agency"
      access="clients"
      roles={ROLES}
      members={members ?? []}
      invites={invites ?? []}
      actions={{ invite: inviteStaff, cancelInvite: cancelStaffInvite, changeRole: changeStaffRole, removeMember: removeStaff }}
    />
  );
}
