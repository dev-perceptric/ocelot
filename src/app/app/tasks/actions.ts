"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/supabase/server";
import { validTimeZone } from "@/lib/profile";
import { zonedToUtc } from "@/lib/when";

type Result = { ok: boolean; message?: string };
export type TaskState = { error?: string; doneAt?: number };

const refresh = (itemId?: string | null) => {
  revalidatePath("/app");
  revalidatePath("/app/tasks");
  revalidatePath("/app/tracker");
  if (itemId) revalidatePath(`/app/tracker/${itemId}`);
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

async function me() {
  const { supabase, user } = await currentUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("time_zone").eq("id", user.id).single();
  const tz = data?.time_zone && validTimeZone(data.time_zone) ? data.time_zone : "Asia/Ho_Chi_Minh";
  return { supabase, user, tz };
}

function readTask(form: FormData, tz: string) {
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "Add what you need to do." };
  if (title.length > 200) return { error: "Keep the task under 200 characters." };
  const date = String(form.get("due_date") ?? "");
  const time = String(form.get("due_time") ?? "");
  if (date && !DATE.test(date)) return { error: "Choose a date." };
  if (time && !TIME.test(time)) return { error: "Choose a time." };
  const item = String(form.get("item_id") ?? "") || null;
  return { title, item, due_at: date ? zonedToUtc(date, time || "09:00", tz).toISOString() : null };
}

export async function saveTask(_: TaskState, form: FormData): Promise<TaskState> {
  const m = await me();
  if (!m) return { error: "Your session ended. Log in again." };
  const t = readTask(form, m.tz);
  if ("error" in t) return { error: t.error };
  const id = String(form.get("id") ?? "");
  const row = { title: t.title, due_at: t.due_at, item_id: t.item };
  const { error } = id
    ? await m.supabase.from("tasks").update(row).eq("id", id).eq("user_id", m.user.id)
    : await m.supabase.from("tasks").insert({ ...row, user_id: m.user.id });
  if (error) return { error: /limit/.test(error.message) ? error.message : "The task didn't save. Try again." };
  refresh(t.item);
  return { doneAt: Date.now() };
}

export async function toggleTask(id: string, done: boolean): Promise<Result> {
  const m = await me();
  if (!m) return { ok: false };
  const { data, error } = await m.supabase.from("tasks").update({ done_at: done ? new Date().toISOString() : null }).eq("id", id).eq("user_id", m.user.id).select("item_id");
  refresh(data?.[0]?.item_id);
  return { ok: !error && Boolean(data?.length) };
}

export async function deleteTask(id: string): Promise<Result> {
  const m = await me();
  if (!m) return { ok: false };
  const { data, error } = await m.supabase.from("tasks").delete().eq("id", id).eq("user_id", m.user.id).select("item_id");
  refresh(data?.[0]?.item_id);
  return { ok: !error && Boolean(data?.length) };
}

export async function saveInterview(_: TaskState, form: FormData): Promise<TaskState> {
  const m = await me();
  if (!m) return { error: "Your session ended. Log in again." };
  const item = String(form.get("item_id") ?? "");
  const date = String(form.get("date") ?? "");
  const time = String(form.get("time") ?? "");
  if (!DATE.test(date)) return { error: "Choose the interview date." };
  if (!TIME.test(time)) return { error: "Choose the interview time." };
  const title = String(form.get("title") ?? "").trim().slice(0, 120) || null;
  const notes = String(form.get("notes") ?? "").trim();
  if (notes.length > 5000) return { error: "Keep prep notes under 5,000 characters." };
  let meeting_url: string | null = String(form.get("meeting_url") ?? "").trim() || null;
  if (meeting_url) {
    try { meeting_url = new URL(/^https?:\/\//i.test(meeting_url) ? meeting_url : `https://${meeting_url}`).toString(); }
    catch { return { error: "Enter the meeting link, like meet.google.com/abc-defg-hij." }; }
  }
  const id = String(form.get("id") ?? "");
  const row = { starts_at: zonedToUtc(date, time, m.tz).toISOString(), title, meeting_url, notes };
  const { error } = id
    ? await m.supabase.from("interviews").update(row).eq("id", id).eq("user_id", m.user.id)
    : await m.supabase.from("interviews").insert({ ...row, item_id: item, user_id: m.user.id });
  if (error) return { error: /limit/.test(error.message) ? error.message : "The interview didn't save. Try again." };
  refresh(item);
  return { doneAt: Date.now() };
}

export async function deleteInterview(id: string): Promise<Result> {
  const m = await me();
  if (!m) return { ok: false };
  const { data, error } = await m.supabase.from("interviews").delete().eq("id", id).eq("user_id", m.user.id).select("item_id");
  refresh(data?.[0]?.item_id);
  return { ok: !error && Boolean(data?.length) };
}
