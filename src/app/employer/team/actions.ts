"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { SITE_URL } from "@/lib/env";
import { queueEmail } from "@/lib/email/send";
import { teamInvite } from "@/lib/email/templates";
import { canManage, myOrgs, type Role } from "@/lib/org";

type Result = { ok: boolean; message?: string };
// Database rules raise plain-language messages; pass those through, hide anything else.
const say = (e: { message: string } | null, fallback: string) =>
  e && /^[A-Z][^\n]{8,140}$/.test(e.message) && !/violates|permission|relation|column/i.test(e.message) ? e.message : fallback;

export type InviteState = { error?: string; sentTo?: string };

export async function invite(_: InviteState, form: FormData): Promise<InviteState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const role = String(form.get("role") ?? "member");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  if (role !== "admin" && role !== "member") return { error: "Choose admin or member." };

  const { supabase, user, current } = await myOrgs();
  if (!user || !current || !canManage(current.role)) return { error: "Only owners and admins can invite people." };
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

export async function changeRole(userId: string, role: Role): Promise<Result> {
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
