"use server";

import { revalidatePath } from "next/cache";
import { isSettable } from "@/lib/hiring";
import { myOrgs } from "@/lib/org";

type Result = { ok: boolean; message?: string; moved?: number };
const UUID = /^[0-9a-f-]{36}$/;

const refresh = (id?: string) => {
  revalidatePath("/employer/applicants");
  if (id) revalidatePath(`/employer/applicants/${id}`);
};

// Moves one or more applicants. Withdrawn applications stay as they are (the database refuses them anyway).
export async function moveApplicants(ids: string[], stage: string): Promise<Result> {
  if (!isSettable(stage)) return { ok: false, message: "Choose a stage." };
  const clean = [...new Set(ids)].filter((id) => UUID.test(id)).slice(0, 200);
  if (!clean.length) return { ok: false, message: "Choose applicants first." };
  const { supabase, current } = await myOrgs();
  if (!current) return { ok: false, message: "Your session ended. Log in again." };
  const { data, error } = await supabase.from("applications").update({ hiring_stage: stage })
    .in("id", clean).eq("org_id", current.id).neq("hiring_stage", "withdrawn").neq("hiring_stage", stage).select("id");
  refresh(clean.length === 1 ? clean[0] : undefined);
  if (error) return { ok: false, message: "That didn't move. Try again." };
  return { ok: true, moved: data?.length ?? 0 };
}

export async function addNote(applicationId: string, body: string): Promise<Result> {
  const text = body.trim();
  if (!text) return { ok: false, message: "Write a note first." };
  if (text.length > 5000) return { ok: false, message: "Keep notes under 5,000 characters." };
  const { supabase, user, current } = await myOrgs();
  if (!user || !current) return { ok: false, message: "Your session ended. Log in again." };
  const { error } = await supabase.from("application_notes").insert({ application_id: applicationId, author_id: user.id, body: text });
  refresh(applicationId);
  return { ok: !error, message: "The note didn't save. Try again." };
}

export async function deleteNote(applicationId: string, noteId: string): Promise<Result> {
  const { supabase, user } = await myOrgs();
  if (!user) return { ok: false, message: "Your session ended. Log in again." };
  const { data, error } = await supabase.from("application_notes").delete().eq("id", noteId).eq("author_id", user.id).select("id");
  refresh(applicationId);
  return { ok: !error && Boolean(data?.length), message: "That didn't delete. Try again." };
}
