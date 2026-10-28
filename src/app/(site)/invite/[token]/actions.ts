"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SITE_URL } from "@/lib/env";
import { queueEmail } from "@/lib/email/send";
import { inviteAccepted } from "@/lib/email/templates";
import { ORG_COOKIE } from "@/lib/org";
import { createAdmin, currentUser } from "@/lib/supabase/server";

export type AcceptState = { error?: string };

export async function accept(_: AcceptState, form: FormData): Promise<AcceptState> {
  const token = String(form.get("token") ?? "");
  const { supabase, user } = await currentUser();
  if (!user) redirect(`/login?next=/invite/${encodeURIComponent(token)}`);
  const { data: orgId, error } = await supabase.rpc("accept_invite", { p_token: token });
  if (error || !orgId) return { error: error?.message ?? "This invite didn't work. Ask for a new one." };

  (await cookies()).set(ORG_COOKIE, orgId, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });

  // Tell the person who sent the invite. Looked up with the service role: the invite was just accepted by this user.
  const db = createAdmin();
  const { data: inv } = await db.from("org_invites").select("invited_by, org:orgs(name)").eq("org_id", orgId).eq("accepted_by", user.id)
    .order("accepted_at", { ascending: false }).limit(1).maybeSingle();
  if (inv?.invited_by) {
    const { data: inviter } = await db.auth.admin.getUserById(inv.invited_by);
    const { data: me } = await db.from("profiles").select("full_name").eq("id", user.id).single();
    if (inviter.user?.email) {
      await queueEmail({
        to: inviter.user.email,
        kind: "invite_accepted",
        email: inviteAccepted({ company: (inv.org as unknown as { name: string })?.name ?? "your company", member: me?.full_name || user.email || "Your teammate", teamUrl: `${SITE_URL}/employer/team` }),
      }).catch((e) => console.error("invite_accepted email", e));
    }
  }
  redirect("/employer");
}
