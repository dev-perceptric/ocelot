"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ORG_COOKIE } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/jobs";

export type OrgState = { error?: string };

export async function createCompany(_: OrgState, form: FormData): Promise<OrgState> {
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Add your company name." };
  const base = slugify(name) || "company";
  const supabase = await createClient();

  // Try the plain slug first, then add a short ending if another company has it.
  for (const slug of [base, `${base}-${Math.random().toString(36).slice(2, 6)}`]) {
    const { data: id, error } = await supabase.rpc("create_org", { p_name: name, p_slug: slug });
    if (!error) {
      if (id) (await cookies()).set(ORG_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
      revalidatePath("/employer");
      return {};
    }
    if (error.code !== "23505") return { error: error.message };
  }
  return { error: "That name is taken. Try a slightly different one." };
}
