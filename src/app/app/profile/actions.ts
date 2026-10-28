"use server";

import { revalidatePath } from "next/cache";
import { readProfile, type ProfileErrors } from "@/lib/profile";
import { currentUser } from "@/lib/supabase/server";

export type ProfileState = { errors?: ProfileErrors; error?: string; savedAt?: number };

export async function saveProfile(_: ProfileState, form: FormData): Promise<ProfileState> {
  const { data, errors } = readProfile(form);
  if (!data) return { errors };
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Your session ended. Log in again." };
  const { error } = await supabase.from("profiles").update(data).eq("id", user.id);
  if (error) return { error: "That didn't save. Try again." };
  revalidatePath("/app/profile");
  return { savedAt: Date.now() };
}
