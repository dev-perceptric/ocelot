import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getJob } from "@/lib/queries";
import { currentUser } from "@/lib/supabase/server";
import { ApplyForm } from "./ApplyForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Apply", robots: { index: false } };

export default async function Apply({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, user } = await currentUser();
  if (!user) redirect(`/login?next=/jobs/${slug}/apply`);
  const job = await getJob(slug);
  if (!job) notFound();
  const open = job.status === "published" && job.apply_method === "ocelot" && (!job.expires_at || new Date(job.expires_at) > new Date());

  const [{ data: sent }, { data: profile }, { data: resumes }, { data: questions }] = await Promise.all([
    supabase.from("applications").select("id").eq("job_id", job.id).eq("candidate_id", user.id).maybeSingle(),
    supabase.from("profiles").select("full_name, phone, email").eq("id", user.id).single(),
    supabase.from("documents").select("id, name").eq("user_id", user.id).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("job_questions").select("id, prompt, required").eq("job_id", job.id).order("position"),
  ]);
  if (sent) {
    const { data: card } = await supabase.from("tracker_items").select("id").eq("application_id", sent.id).maybeSingle();
    redirect(card ? `/app/tracker/${card.id}` : `/jobs/${slug}`);
  }

  return (
    <div className="mx-auto max-w-[720px] px-5 py-10 md:px-8 md:py-16">
      <Link href={`/jobs/${slug}`} className="text-meta underline">{job.title}</Link>
      <h1 className="mt-3 text-section-sm font-bold md:text-section">Apply to {job.org.name}</h1>
      {open ? (
        <ApplyForm slug={slug} userId={user.id} email={profile?.email ?? user.email ?? ""}
          profile={{ full_name: profile?.full_name ?? "", phone: profile?.phone ?? "" }}
          resumes={resumes ?? []} questions={questions ?? []} />
      ) : (
        <p className="mt-4 text-body">This job isn&apos;t taking applications.</p>
      )}
    </div>
  );
}
