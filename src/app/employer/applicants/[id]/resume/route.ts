import { NextResponse, type NextRequest } from "next/server";
import { RESUME_EXT, type ResumeType } from "@/lib/resumes";
import { readSnapshot } from "@/lib/snapshot";
import { createAdmin } from "@/lib/supabase/server";
import { myOrgs } from "@/lib/org";

// Opens the résumé sent with an application through a one-minute signed link. Row rules decide whether this
// person can see the application and its résumé; only then does the server sign the link with the service role.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await myOrgs();
  if (!user) return NextResponse.redirect(new URL(`/login?next=/employer/applicants/${id}`, req.url));
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const { data: app } = await supabase.from("applications").select("resume_id, snapshot").eq("id", id).maybeSingle();
  if (!app?.resume_id) return new NextResponse("Not found", { status: 404 });
  const { data: doc } = await supabase.from("documents").select("storage_path, mime_type").eq("id", app.resume_id).maybeSingle();
  if (!doc) return new NextResponse("Not found", { status: 404 });
  const name = `${readSnapshot(app.snapshot).name} résumé.${RESUME_EXT[doc.mime_type as ResumeType] ?? "pdf"}`;
  const { data } = await createAdmin().storage.from("resumes").createSignedUrl(doc.storage_path, 60, { download: name });
  if (!data?.signedUrl) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
