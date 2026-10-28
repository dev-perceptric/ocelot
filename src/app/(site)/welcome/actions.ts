"use server";

import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth";
import { currentUser } from "@/lib/supabase/server";

export type WelcomeState = { error?: string };

export async function chooseIntent(_: WelcomeState, form: FormData): Promise<WelcomeState> {
  const intent = form.get("intent");
  if (intent !== "candidate" && intent !== "employer") return { error: "Choose one to continue." };
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login");
  const { error } = await supabase.from("profiles").update({ intent }).eq("id", user.id);
  if (error) return { error: "That didn't save. Try again." };

  // Someone who was headed somewhere specific (a job page, an invite) goes back there.
  const next = safeNext(form.get("next"), "");
  const home = intent === "employer" ? "/employer" : "/app";
  redirect(next && next !== "/app" ? next : home);
}
