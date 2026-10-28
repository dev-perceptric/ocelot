"use server";

import { revalidatePath } from "next/cache";
import { logoPathOk, readCompany, type CompanyErrors } from "@/lib/company";
import { canManage, myOrgs } from "@/lib/org";

export type CompanyState = { errors?: CompanyErrors; error?: string; savedAt?: number };

export async function saveCompany(_: CompanyState, form: FormData): Promise<CompanyState> {
  const { data, errors } = readCompany(form);
  if (!data) return { errors };
  const { supabase, current } = await myOrgs();
  if (!current || !canManage(current.role)) return { error: "Only owners and admins can change company settings." };
  const { error } = await supabase.from("orgs").update(data).eq("id", current.id);
  if (error) {
    if (error.code === "23505" || /address was used/.test(error.message)) return { errors: { slug: "Another company uses that address." } };
    return { error: "That didn't save. Try again." };
  }
  revalidatePath("/employer", "layout");
  return { savedAt: Date.now() };
}

// The browser uploads the file to the company's folder (storage rules check the role); this saves its address.
export async function setLogo(path: string | null): Promise<{ ok: boolean }> {
  const { supabase, current } = await myOrgs();
  if (!current || !canManage(current.role)) return { ok: false };
  if (path !== null && !logoPathOk(current.id, path)) return { ok: false };
  const logo_url = path ? supabase.storage.from("logos").getPublicUrl(path).data.publicUrl : null;
  const { error } = await supabase.from("orgs").update({ logo_url }).eq("id", current.id);
  revalidatePath("/employer", "layout");
  return { ok: !error };
}
