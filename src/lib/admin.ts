import "server-only";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";

// Every admin page and action calls this first. Non-admins get a plain 404, so the area isn't advertised.
export async function requireAdmin() {
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login?next=/admin");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) notFound();
  return { supabase, user };
}

// Every admin change leaves a row in audit_events: who, what, on which record, and the details.
// target.id is a record's uuid; for records with number ids (queue tasks) pass null and put the number in detail.
export async function audit(actorId: string, action: string, target: { table: string; id: string | null }, detail: Record<string, unknown> = {}) {
  const { createAdmin } = await import("@/lib/supabase/server");
  const { error } = await createAdmin().from("audit_events").insert({
    actor_id: actorId, action, target_table: target.table, target_id: target.id, detail: detail as never,
  });
  if (error) console.error("audit insert failed", error);
}
