import "server-only";
import { DEFAULT_TZ, validTimeZone } from "@/lib/profile";
import type { createClient } from "@/lib/supabase/server";

// The signed-in person's time zone from their profile (Settings can change it), Vietnam if unset.
export async function myTimeZone(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string> {
  const { data } = await supabase.from("profiles").select("time_zone").eq("id", userId).single();
  return data?.time_zone && validTimeZone(data.time_zone) ? data.time_zone : DEFAULT_TZ;
}
