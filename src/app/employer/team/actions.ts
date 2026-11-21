"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { say } from "@/lib/dbMessage";
import { SITE_URL } from "@/lib/env";
import { queueEmail } from "@/lib/email/send";
import { clientRequestAnswered, teamInvite } from "@/lib/email/templates";
import { canManage, myOrgs } from "@/lib/org";
import { createAdmin } from "@/lib/supabase/server";
import type { InviteState } from "../TeamView";

type Result = { ok: boolean; message?: string };
const ROLES = ["owner", "admin", "member"];

// Team changes are for the company's own team. Agency staff see the list but can't change it.
export async function invite(_: InviteState, form: FormData): Promise<InviteState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const role = String(form.get("role") ?? "member");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  if (role !== "admin" && role !== "member") return { error: "Choose admin or member." };

  const { supabase, user, current } = await myOrgs();
  if (!user || !current || !canManage(current.teamRole ?? undefined)) return { error: "Only owners and admins can invite people." };
  const { data: token, error } = await supabase.rpc("create_invite", { p_org: current.id, p_email: email, p_role: role });
  if (error || !token) return { error: say(error, "The invite didn't send. Try again.") };

  const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
  await queueEmail({
    to: email,
    kind: "team_invite",
    email: teamInvite({ company: current.name, inviter: me?.full_name || user.email || "A teammate", role, url: `${SITE_URL}/invite/${token}`, expiresDays: 7 }),
  });
  revalidatePath("/employer/team");
  return { sentTo: email };
}

export async function cancelInvite(id: string): Promise<Result> {
  const { supabase } = await myOrgs();
  const { error } = await supabase.rpc("revoke_invite", { p_id: id });
  revalidatePath("/employer/team");
  return { ok: !error, message: say(error, "That didn't work. Try again.") };
}

export async function changeRole(userId: string, role: string): Promise<Result> {
  if (!ROLES.includes(role)) return { ok: false };
  const { supabase, current } = await myOrgs();
  if (!current) return { ok: false };
  const { data, error } = await supabase.from("org_members").update({ role }).eq("org_id", current.id).eq("user_id", userId).select("user_id");
  revalidatePath("/employer/team");
  if (!error && !data?.length) return { ok: false, message: "You can't change this person's role." };
  return { ok: !error, message: say(error, "That didn't work. Try again.") };
}

export async function removeMember(userId: string): Promise<Result> {
  const { supabase, user, current } = await myOrgs();
  if (!current || !user) return { ok: false };
  const { data, error } = await supabase.from("org_members").delete().eq("org_id", current.id).eq("user_id", userId).select("user_id");
  if (!error && !data?.length) return { ok: false, message: "You can't remove this person." };
  if (error) return { ok: false, message: say(error, "That didn't work. Try again.") };
  if (userId === user.id) redirect("/employer");
  revalidatePath("/employer/team");
  return { ok: true };
}

// The company's owner says yes or no to an agency. The database checks they're the owner.
export async function answerAgency(requestId: string, accept: boolean): Promise<Result> {
  const { supabase } = await myOrgs();
  const { error } = await supabase.rpc("answer_agency_client_request", { p_id: requestId, p_accept: accept });
  if (error) return { ok: false, message: say(error, "That didn't work. Try again.") };

  // Tell the person who asked. Read with the service role: the request was just answered by this owner.
  const db = createAdmin();
  const { data: r } = await db.from("agency_client_requests").select("agency_name, org_name, requested_by").eq("id", requestId).single();
  if (r?.requested_by) {
    const { data: asker } = await db.auth.admin.getUserById(r.requested_by);
    if (asker.user?.email) {
      await queueEmail({
        to: asker.user.email,
        kind: "client_request_answered",
        email: clientRequestAnswered({ agency: r.agency_name, company: r.org_name, accepted: accept, url: `${SITE_URL}/employer/agency` }),
      }).catch((e) => console.error("client_request_answered email", e));
    }
  }
  revalidatePath("/employer", "layout");
  return { ok: true };
}

// Ends the agency's access to this company at once.
export async function removeAgency(): Promise<Result> {
  const { supabase, current } = await myOrgs();
  if (!current) return { ok: false };
  const { error } = await supabase.rpc("remove_agency_client", { p_org: current.id });
  revalidatePath("/employer", "layout");
  return { ok: !error, message: say(error, "That didn't work. Try again.") };
}
