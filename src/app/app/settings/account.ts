"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { deletionPlan, type Membership } from "@/lib/account";
import { audit } from "@/lib/admin";
import { createAdmin, currentUser } from "@/lib/supabase/server";

export type DeleteState = { error?: string };

async function removeFolder(bucket: "resumes" | "logos", folder: string) {
  const store = createAdmin().storage.from(bucket);
  for (;;) {
    const { data } = await store.list(folder, { limit: 100 });
    if (!data?.length) return;
    const { error } = await store.remove(data.map((f) => `${folder}/${f.name}`));
    if (error) throw error;
  }
}

// Deletes the signed-in person's account. They type their email to confirm. Uses the service role after
// checking who is asking: storage files and the sign-in itself can't be removed with their own access.
export async function deleteAccount(_: DeleteState, form: FormData): Promise<DeleteState> {
  const { user } = await currentUser();
  if (!user?.email) return { error: "Your session ended. Log in again." };
  if (String(form.get("confirm") ?? "").trim().toLowerCase() !== user.email.toLowerCase()) {
    return { error: `Type ${user.email} to confirm.` };
  }

  const db = createAdmin();
  const { data: rows } = await db.from("org_members").select("org_id, role, org:orgs(name)").eq("user_id", user.id);
  const memberships: Membership[] = await Promise.all((rows ?? []).map(async (r) => {
    const { data: all } = await db.from("org_members").select("role").eq("org_id", r.org_id);
    return {
      orgId: r.org_id,
      name: (r.org as unknown as { name: string } | null)?.name ?? "a company",
      role: r.role as Membership["role"],
      members: all?.length ?? 1,
      owners: (all ?? []).filter((m) => m.role === "owner").length,
    };
  }));
  const { blockers, companiesToDelete } = deletionPlan(memberships);
  if (blockers.length) {
    return { error: `You're the only owner of ${blockers.map((b) => b.name).join(", ")}. Make someone else an owner first, in Team.` };
  }

  try {
    for (const c of companiesToDelete) {
      await removeFolder("logos", c.orgId);
      const { error } = await db.from("orgs").delete().eq("id", c.orgId);
      if (error) throw error;
    }
    await removeFolder("resumes", user.id);
    // Logged before the account goes; no name or email, only what happened.
    await audit(user.id, "account.delete", { table: "auth.users", id: user.id }, { companies_deleted: companiesToDelete.length });
    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error) throw error;
  } catch (e) {
    console.error("deleteAccount", e);
    return { error: "Your account wasn't deleted. Try again, or email hello@joinocelot.com." };
  }

  // The session belongs to a deleted account now; clear it in this browser.
  const jar = await cookies();
  jar.getAll().filter((c) => c.name.startsWith("sb-")).forEach((c) => jar.delete(c.name));
  redirect("/goodbye");
}
