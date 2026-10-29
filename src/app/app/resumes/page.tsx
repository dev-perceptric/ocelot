import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ToolIntro } from "@/components/ui";
import { myTimeZone } from "@/lib/myTz";
import { currentUser } from "@/lib/supabase/server";
import { ResumeTable, UploadResume, type Resume } from "./ResumeParts";

export const metadata: Metadata = { title: "Résumés" };
export const dynamic = "force-dynamic";

export default async function Resumes() {
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login?next=/app/resumes");
  const [{ data: docs }, { data: used }, { data: sent }, tz] = await Promise.all([
    supabase.from("documents").select("id, name, mime_type, size_bytes, created_at").eq("user_id", user.id).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("tracker_items").select("resume_id").not("resume_id", "is", null),
    supabase.from("applications").select("resume_id").eq("candidate_id", user.id).not("resume_id", "is", null),
    myTimeZone(supabase, user.id),
  ]);
  const count = new Map<string, number>();
  for (const u of used ?? []) if (u.resume_id) count.set(u.resume_id, (count.get(u.resume_id) ?? 0) + 1);
  const sentIds = new Set((sent ?? []).map((a) => a.resume_id));
  const resumes: Resume[] = (docs ?? []).map((d) => ({ ...d, added: new Date(d.created_at).toLocaleDateString("en-GB", { timeZone: tz, day: "numeric", month: "short", year: "numeric" }), used: count.get(d.id) ?? 0, sent: sentIds.has(d.id) }));

  if (!resumes.length) {
    return (
      <ToolIntro title="Keep every version of your résumé"
        line="Upload a PDF or Word file for each version, then pick which one you sent on each job in your tracker."
        action={<UploadResume userId={user.id} />} />
    );
  }
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-title font-bold">Résumés</h1>
        <UploadResume userId={user.id} />
      </div>
      <div className="mt-8"><ResumeTable resumes={resumes} /></div>
    </>
  );
}
