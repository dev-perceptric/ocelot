"use server";

import { revalidatePath } from "next/cache";
import { RESUME_MAX, isResumePath, resumeName, sniffResume } from "@/lib/resumes";
import { createAdmin, currentUser } from "@/lib/supabase/server";

type Result = { ok: boolean; message?: string };

const refresh = () => {
  revalidatePath("/app/resumes");
  revalidatePath("/app/tracker", "layout");
};

// The browser uploads into the person's own folder; this reads the file's first bytes before it counts.
// A renamed or broken file is removed. The row is added with the service role after checking who is
// asking, since people can't add résumé rows themselves.
export async function addResume(path: string, fileName: string): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { ok: false, message: "Your session ended. Log in again." };
  if (!isResumePath(path, user.id)) return { ok: false, message: "That file didn't upload. Try again." };
  const store = supabase.storage.from("resumes");
  const { data: file } = await store.download(path);
  if (!file) return { ok: false, message: "That file didn't upload. Try again." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffResume(bytes);
  const refuse = async (message: string) => { await store.remove([path]); return { ok: false, message }; };
  if (!type) return refuse("That file isn't a real PDF or Word file. Save it again as PDF or .docx and upload it.");
  if (bytes.length > RESUME_MAX) return refuse("Choose a file under 5 MB.");
  const { error } = await createAdmin().from("documents").insert({
    user_id: user.id, name: resumeName(fileName), storage_path: path, mime_type: type, size_bytes: bytes.length,
  });
  if (error) return refuse(/limit/.test(error.message) ? error.message : "That file didn't upload. Try again.");
  refresh();
  return { ok: true };
}

export async function renameResume(id: string, name: string): Promise<Result> {
  const clean = name.trim();
  if (!clean) return { ok: false, message: "Add a name." };
  if (clean.length > 120) return { ok: false, message: "Keep the name under 120 characters." };
  const { supabase, user } = await currentUser();
  if (!user) return { ok: false, message: "Your session ended. Log in again." };
  const { data, error } = await supabase.from("documents").update({ name: clean }).eq("id", id).eq("user_id", user.id).select("id");
  refresh();
  return { ok: !error && Boolean(data?.length), message: "That didn't save. Try again." };
}

export async function deleteResume(id: string): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { ok: false, message: "Your session ended. Log in again." };
  const fail = { ok: false, message: "That didn't delete. Try again." };
  const { data: doc } = await supabase.from("documents").select("storage_path").eq("id", id).eq("user_id", user.id).is("deleted_at", null).maybeSingle();
  if (!doc) return fail;
  const { error } = await supabase.from("documents").delete().eq("id", id).eq("user_id", user.id);
  if (error) return fail;
  // A résumé sent with an application is only hidden (the database keeps it for the company), so its file stays.
  const { data: kept } = await supabase.from("documents").select("id").eq("id", id).maybeSingle();
  if (!kept) await supabase.storage.from("resumes").remove([doc.storage_path]);
  refresh();
  return { ok: true };
}

// Which résumé went with a job, on its tracker card. The database checks the résumé is the person's own.
export async function setCardResume(itemId: string, resumeId: string | null): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { ok: false, message: "Your session ended. Log in again." };
  const { data, error } = await supabase.from("tracker_items").update({ resume_id: resumeId || null }).eq("id", itemId).eq("user_id", user.id).select("id");
  revalidatePath(`/app/tracker/${itemId}`);
  return { ok: !error && Boolean(data?.length), message: "That didn't save. Try again." };
}
