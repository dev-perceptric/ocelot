import { NextResponse, type NextRequest } from "next/server";
import { RESUME_EXT, type ResumeType } from "@/lib/resumes";
import { currentUser } from "@/lib/supabase/server";

// Opens a résumé through a one-minute signed link. Row rules make sure it's the person's own file.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/app/resumes", req.url));
  const { data: doc } = await supabase.from("documents").select("name, storage_path, mime_type").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!doc) return new NextResponse("Not found", { status: 404 });
  const { data } = await supabase.storage.from("resumes")
    .createSignedUrl(doc.storage_path, 60, { download: `${doc.name}.${RESUME_EXT[doc.mime_type as ResumeType] ?? "pdf"}` });
  if (!data?.signedUrl) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
