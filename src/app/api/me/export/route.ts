import { currentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// "Export my data": everything this person owns, as one JSON file. Read with their own access, so row level
// security decides what's included, exactly as in the app.
export async function GET() {
  const { supabase, user } = await currentUser();
  if (!user) return new Response("Log in to export your data.", { status: 401 });

  const own = async (table: "tracker_items" | "tracker_events" | "tasks" | "interviews" | "saved_jobs" | "saved_searches" | "documents" | "reports", col = "user_id") => {
    const { data } = await supabase.from(table).select("*").eq(col, user.id);
    return data ?? [];
  };
  const [profile, prefs, applications, memberships] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("notification_prefs").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("applications").select("id, job_id, submitted_at, hiring_stage, snapshot, job:jobs(title), org:orgs(name), events:application_events(kind, to_stage, created_at)").eq("candidate_id", user.id),
    supabase.from("org_members").select("role, created_at, org:orgs(name, slug)").eq("user_id", user.id),
  ]);

  const data = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email, created_at: user.created_at, last_sign_in_at: user.last_sign_in_at },
    profile: profile.data,
    email_choices: prefs.data,
    tracker: { items: await own("tracker_items"), history: await own("tracker_events"), tasks: await own("tasks"), interviews: await own("interviews") },
    saved_jobs: await own("saved_jobs"),
    saved_searches: await own("saved_searches"),
    documents: await own("documents"),
    applications: applications.data ?? [],
    companies: memberships.data ?? [],
    reports: await own("reports", "reporter_id"),
  };

  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="ocelot-data-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
