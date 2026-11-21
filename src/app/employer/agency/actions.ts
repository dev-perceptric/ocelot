"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { agencyLogoPathOk, companySlugFrom, readAgency, type AgencyErrors } from "@/lib/agency";
import { say } from "@/lib/dbMessage";
import { SITE_URL } from "@/lib/env";
import { queueEmail } from "@/lib/email/send";
import { agencyInvite, clientRequest } from "@/lib/email/templates";
import { slugify } from "@/lib/jobs";
import { AGENCY_COOKIE, canManageAgency, COOKIE_OPTIONS, myOrgs, ORG_COOKIE } from "@/lib/org";
import { createAdmin } from "@/lib/supabase/server";
import type { InviteState } from "../TeamView";

type Result = { ok: boolean; message?: string };
const short = () => Math.random().toString(36).slice(2, 6);

// ---------- The agency ----------

export type CreateState = { error?: string };

export async function createAgency(_: CreateState, form: FormData): Promise<CreateState> {
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Add your agency's name." };
  if (name.length > 120) return { error: "Keep the name under 120 characters." };
  const { supabase, user } = await myOrgs();
  if (!user) return { error: "Your session ended. Log in again." };
  const base = slugify(name) || "agency";
  // Try the plain address first, then add a short ending if another agency has it.
  for (const slug of [base, `${base}-${short()}`]) {
    const { data: id, error } = await supabase.rpc("create_agency", { p_name: name, p_slug: slug });
    if (!error) {
      if (id) (await cookies()).set(AGENCY_COOKIE, id, COOKIE_OPTIONS);
      revalidatePath("/employer", "layout");
      return {};
    }
    if (error.code !== "23505") return { error: say(error, "The agency wasn't created. Try again.") };
  }
  return { error: "That name is taken. Try a slightly different one." };
}

export async function switchAgency(id: string) {
  const { agencies } = await myOrgs();
  if (!agencies.some((a) => a.id === id)) return;
  (await cookies()).set(AGENCY_COOKIE, id, COOKIE_OPTIONS);
  redirect("/employer/agency");
}

export type AgencyState = { errors?: AgencyErrors; error?: string; savedAt?: number };

export async function saveAgency(_: AgencyState, form: FormData): Promise<AgencyState> {
  const { data, errors } = readAgency(form);
  if (!data) return { errors };
  const { supabase, agency } = await myOrgs();
  if (!agency || !canManageAgency(agency.role)) return { error: "Only agency owners and admins can change these settings." };
  const { error } = await supabase.from("agencies").update(data).eq("id", agency.id);
  if (error) {
    if (error.code === "23505") return { errors: { slug: "Another agency uses that address." } };
    return { error: "That didn't save. Try again." };
  }
  revalidatePath("/employer", "layout");
  return { savedAt: Date.now() };
}

// The browser uploads the file to the agency's folder (storage rules check the role); this saves its address.
export async function setAgencyLogo(path: string | null): Promise<{ ok: boolean }> {
  const { supabase, agency } = await myOrgs();
  if (!agency || !canManageAgency(agency.role)) return { ok: false };
  if (path !== null && !agencyLogoPathOk(agency.id, path)) return { ok: false };
  const logo_url = path ? supabase.storage.from("logos").getPublicUrl(path).data.publicUrl : null;
  const { error } = await supabase.from("agencies").update({ logo_url }).eq("id", agency.id);
  revalidatePath("/employer", "layout");
  return { ok: !error };
}

// ---------- Clients ----------

export type ClientState = { error?: string; done?: string };

// A new client the agency runs. It has no team of its own.
export async function addClient(_: ClientState, form: FormData): Promise<ClientState> {
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Add the client's company name." };
  if (name.length > 120) return { error: "Keep the name under 120 characters." };
  const { supabase, agency } = await myOrgs();
  if (!agency || !canManageAgency(agency.role)) return { error: "Only agency owners and admins can add clients." };
  const base = slugify(name) || "company";
  for (const slug of [base, `${base}-${short()}`]) {
    const { error } = await supabase.rpc("create_agency_client", { p_agency: agency.id, p_name: name, p_slug: slug });
    if (!error) {
      revalidatePath("/employer", "layout");
      return { done: `${name} is now a client. Open it to post its first job.` };
    }
    if (error.code !== "23505") return { error: say(error, "The client wasn't added. Try again.") };
  }
  return { error: "That name is taken. Try a slightly different one." };
}

// Asks a company that already has its own team. Its owners get an email and answer on their Team page.
export async function askClient(_: ClientState, form: FormData): Promise<ClientState> {
  const slug = companySlugFrom(String(form.get("address") ?? ""));
  if (!slug) return { error: "Paste the company's Ocelot address, like joinocelot.com/companies/example-co." };
  const { supabase, user, agency } = await myOrgs();
  if (!user || !agency || !canManageAgency(agency.role)) return { error: "Only agency owners and admins can add clients." };
  const { data: requestId, error } = await supabase.rpc("request_agency_client", { p_agency: agency.id, p_org_slug: slug });
  if (error || !requestId) return { error: say(error, "The request didn't send. Try again.") };

  // Email the company's owners. Read with the service role: the request was just made with this person's access.
  const db = createAdmin();
  const { data: r } = await db.from("agency_client_requests").select("org_id, org_name").eq("id", requestId).single();
  const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
  if (r) {
    const { data: owners } = await db.from("org_members").select("user_id").eq("org_id", r.org_id).eq("role", "owner");
    for (const o of owners ?? []) {
      const { data: u } = await db.auth.admin.getUserById(o.user_id);
      if (!u.user?.email) continue;
      await queueEmail({
        to: u.user.email,
        kind: "client_request",
        email: clientRequest({ agency: agency.name, company: r.org_name, asker: me?.full_name || user.email || "A recruiter", url: `${SITE_URL}/employer/team` }),
      }).catch((e) => console.error("client_request email", e));
    }
  }
  revalidatePath("/employer/agency");
  return { done: `We asked ${r?.org_name ?? "the company"}. Nothing changes until its owner says yes.` };
}

// Work on a client: it becomes the company the For employers pages show.
export async function openClient(orgId: string) {
  const { orgs } = await myOrgs();
  if (!orgs.some((o) => o.id === orgId)) return;
  (await cookies()).set(ORG_COOKIE, orgId, COOKIE_OPTIONS);
  redirect("/employer");
}

// Ends the arrangement with a company that has its own team.
export async function removeClient(orgId: string): Promise<Result> {
  const { supabase } = await myOrgs();
  const { error } = await supabase.rpc("remove_agency_client", { p_org: orgId });
  revalidatePath("/employer", "layout");
  return { ok: !error, message: say(error, "That didn't work. Try again.") };
}

// Deletes a client the agency runs alone, with its jobs and applicants. The database checks it's an agency owner.
export async function deleteClient(orgId: string): Promise<Result> {
  const { supabase } = await myOrgs();
  const { error } = await supabase.rpc("delete_agency_client", { p_org: orgId });
  if (error) return { ok: false, message: say(error, "That didn't work. Try again.") };
  // The client is gone, so its logo files go too.
  const store = createAdmin().storage.from("logos");
  const { data: files } = await store.list(orgId, { limit: 100 });
  if (files?.length) await store.remove(files.map((f) => `${orgId}/${f.name}`));
  revalidatePath("/employer", "layout");
  return { ok: true };
}

// ---------- Staff ----------

const STAFF_ROLES = ["owner", "admin", "recruiter"];

export async function inviteStaff(_: InviteState, form: FormData): Promise<InviteState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const role = String(form.get("role") ?? "recruiter");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  if (role !== "admin" && role !== "recruiter") return { error: "Choose admin or recruiter." };

  const { supabase, user, agency } = await myOrgs();
  if (!user || !agency || !canManageAgency(agency.role)) return { error: "Only owners and admins can invite people." };
  const { data: token, error } = await supabase.rpc("create_agency_invite", { p_agency: agency.id, p_email: email, p_role: role });
  if (error || !token) return { error: say(error, "The invite didn't send. Try again.") };

  const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
  await queueEmail({
    to: email,
    kind: "agency_invite",
    email: agencyInvite({ agency: agency.name, inviter: me?.full_name || user.email || "A teammate", role, url: `${SITE_URL}/invite/${token}`, expiresDays: 7 }),
  });
  revalidatePath("/employer/agency/team");
  return { sentTo: email };
}

export async function cancelStaffInvite(id: string): Promise<Result> {
  const { supabase } = await myOrgs();
  const { error } = await supabase.rpc("revoke_agency_invite", { p_id: id });
  revalidatePath("/employer/agency/team");
  return { ok: !error, message: say(error, "That didn't work. Try again.") };
}

export async function changeStaffRole(userId: string, role: string): Promise<Result> {
  if (!STAFF_ROLES.includes(role)) return { ok: false };
  const { supabase, agency } = await myOrgs();
  if (!agency) return { ok: false };
  const { data, error } = await supabase.from("agency_members").update({ role }).eq("agency_id", agency.id).eq("user_id", userId).select("user_id");
  revalidatePath("/employer", "layout");
  if (!error && !data?.length) return { ok: false, message: "You can't change this person's role." };
  return { ok: !error, message: say(error, "That didn't work. Try again.") };
}

export async function removeStaff(userId: string): Promise<Result> {
  const { supabase, user, agency } = await myOrgs();
  if (!agency || !user) return { ok: false };
  const { data, error } = await supabase.from("agency_members").delete().eq("agency_id", agency.id).eq("user_id", userId).select("user_id");
  if (!error && !data?.length) return { ok: false, message: "You can't remove this person." };
  if (error) return { ok: false, message: say(error, "That didn't work. Try again.") };
  if (userId === user.id) redirect("/employer");
  revalidatePath("/employer", "layout");
  return { ok: true };
}
