"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { cleanContacts, isStage, readCard, type CardErrors, type Stage } from "@/lib/tracker";

type Result = { ok: boolean; message?: string; id?: string };
export type CardState = { errors?: CardErrors; error?: string; savedAt?: number };

const refresh = (id?: string) => {
  revalidatePath("/app");
  revalidatePath("/app/tracker");
  if (id) revalidatePath(`/app/tracker/${id}`);
};
const say = (e: { message: string } | null, fallback: string) =>
  e && /^[A-Z][^\n]{8,160}$/.test(e.message) && !/violates|permission|relation|column|syntax/i.test(e.message) ? e.message : fallback;

export async function createCard(_: CardState, form: FormData): Promise<CardState> {
  const { data, errors } = readCard(form);
  if (!data) return { errors };
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Your session ended. Log in again." };
  const { data: row, error } = await supabase.from("tracker_items").insert({ ...data, user_id: user.id }).select("id").single();
  if (error || !row) return { error: say(error, "The job didn't save. Try again.") };
  refresh();
  redirect(`/app/tracker/${row.id}`);
}

export async function updateCard(_: CardState, form: FormData): Promise<CardState> {
  const id = String(form.get("id") ?? "");
  const { data, errors } = readCard(form);
  if (!data) return { errors };
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Your session ended. Log in again." };
  // Notes and stage have their own controls on the card page; this saves the details.
  const { title, company, url, location, salary } = data;
  const { error } = await supabase.from("tracker_items").update({ title, company, url, location, salary }).eq("id", id).eq("user_id", user.id);
  if (error) return { error: say(error, "That didn't save. Try again.") };
  refresh(id);
  return { savedAt: Date.now() };
}

export async function setStage(id: string, stage: Stage, position?: number): Promise<Result> {
  if (!isStage(stage)) return { ok: false };
  const { supabase, user } = await currentUser();
  if (!user) return { ok: false, message: "Your session ended. Log in again." };
  const patch: { stage: Stage; position?: number } = { stage };
  if (typeof position === "number" && Number.isFinite(position)) patch.position = position;
  const { data, error } = await supabase.from("tracker_items").update(patch).eq("id", id).eq("user_id", user.id).select("id");
  refresh(id);
  return { ok: !error && Boolean(data?.length), message: say(error, "That didn't move. Try again.") };
}

export async function saveNotes(id: string, notes: string): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { ok: false, message: "Your session ended. Log in again." };
  if (notes.length > 20000) return { ok: false, message: "Keep notes under 20,000 characters." };
  const { error } = await supabase.from("tracker_items").update({ notes }).eq("id", id).eq("user_id", user.id);
  if (!error) await supabase.from("tracker_events").insert({ item_id: id, user_id: user.id, kind: "notes", detail: {} });
  return { ok: !error };
}

export async function saveContacts(id: string, contacts: unknown): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { ok: false, message: "Your session ended. Log in again." };
  const { error } = await supabase.from("tracker_items").update({ contacts: cleanContacts(contacts) }).eq("id", id).eq("user_id", user.id);
  refresh(id);
  return { ok: !error };
}

export async function deleteCard(id: string): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { ok: false };
  const { error } = await supabase.from("tracker_items").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, message: "That didn't delete. Try again." };
  refresh();
  redirect("/app/tracker");
}

// From a job page.
export async function saveJob(jobId: string): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { ok: false, message: "Log in to save jobs." };
  const { data, error } = await supabase.rpc("save_job", { p_job: jobId });
  refresh();
  return { ok: !error, id: data ?? undefined, message: say(error, "That didn't save. Try again.") };
}

export async function markApplied(jobId: string): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { ok: false, message: "Log in to track this job." };
  const { data, error } = await supabase.rpc("mark_applied", { p_job: jobId });
  refresh();
  return { ok: !error, id: data ?? undefined, message: say(error, "That didn't save. Try again.") };
}
