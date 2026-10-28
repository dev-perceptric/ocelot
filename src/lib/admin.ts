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
