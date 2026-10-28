"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { myOrgs, ORG_COOKIE } from "@/lib/org";

export async function switchOrg(id: string) {
  const { orgs } = await myOrgs();
  if (!orgs.some((o) => o.id === id)) return;
  (await cookies()).set(ORG_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/employer");
}
