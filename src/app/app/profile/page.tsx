import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login?next=/app/profile");
  const { data: p } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const links = (Array.isArray(p?.links) ? p.links : []) as { kind?: string; url?: string }[];
  const link = (kind: string) => links.find((l) => l.kind === kind)?.url ?? "";

  return (
    <>
      <h1 className="text-title font-bold">Profile</h1>
      <p className="mt-2 text-body text-muted">Companies see this only when you apply to them.</p>
      <div className="mt-8">
        <ProfileForm
          email={user.email ?? ""}
          zones={Intl.supportedValuesOf("timeZone")}
          values={{
            full_name: p?.full_name ?? "",
            headline: p?.headline ?? "",
            phone: p?.phone ?? "",
            city: p?.city ?? null,
            years_experience: p?.years_experience?.toString() ?? "",
            work_countries: p?.work_countries ?? [],
            languages: p?.languages ?? [],
            open_to: p?.open_to ?? [],
            salary_hope_min: p?.salary_hope_min?.toString() ?? "",
            salary_hope_currency: p?.salary_hope_currency ?? null,
            salary_hope_period: p?.salary_hope_period ?? null,
            linkedin: link("linkedin"),
            website: link("website"),
            time_zone: p?.time_zone ?? "Asia/Ho_Chi_Minh",
          }}
        />
      </div>
    </>
  );
}
