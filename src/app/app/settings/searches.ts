"use server";

import { revalidatePath } from "next/cache";
import { readFilters, toSaved } from "@/lib/search";
import { currentUser } from "@/lib/supabase/server";

export type SaveSearchState = { error?: string; savedAt?: number };
type Result = { ok: boolean; message?: string };
const FREQ = ["daily", "weekly", "off"] as const;

// Saves the search on screen (its address is sent as "search") with a name and how often to email new matches.
export async function saveSearch(_: SaveSearchState, form: FormData): Promise<SaveSearchState> {
  const name = String(form.get("name") ?? "").trim();
  const frequency = String(form.get("frequency") ?? "weekly");
  if (!name) return { error: "Add a name." };
  if (name.length > 80) return { error: "Keep the name under 80 characters." };
  if (!(FREQ as readonly string[]).includes(frequency) || frequency === "off") return { error: "Choose how often." };
  const f = readFilters(Object.fromEntries(new URLSearchParams(String(form.get("search") ?? "").replace(/^\?/, ""))));
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Your session ended. Log in again." };
  const { error } = await supabase.from("saved_searches").insert({ user_id: user.id, name, query: f.q, filters: toSaved(f), frequency });
  if (error) return { error: /limit/.test(error.message) ? "You have 20 saved searches. Delete one in Settings first." : "That didn't save. Try again." };
  revalidatePath("/app/settings");
  return { savedAt: Date.now() };
}

export async function setSearchFrequency(id: string, frequency: string): Promise<Result> {
  if (!(FREQ as readonly string[]).includes(frequency)) return { ok: false };
  const { supabase, user } = await currentUser();
  if (!user) return { ok: false, message: "Your session ended. Log in again." };
  const { data, error } = await supabase.from("saved_searches").update({ frequency }).eq("id", id).eq("user_id", user.id).select("id");
  revalidatePath("/app/settings");
  return { ok: !error && Boolean(data?.length), message: "That didn't save. Try again." };
}

export async function deleteSearch(id: string): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { ok: false, message: "Your session ended. Log in again." };
  const { data, error } = await supabase.from("saved_searches").delete().eq("id", id).eq("user_id", user.id).select("id");
  revalidatePath("/app/settings");
  return { ok: !error && Boolean(data?.length), message: "That didn't delete. Try again." };
}
