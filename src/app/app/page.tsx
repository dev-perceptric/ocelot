import { Empty, ButtonLink } from "@/components/ui";
import { currentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const COLUMNS = ["Saved", "Applied", "Interviewing", "Offer", "Accepted"];

export default async function MySearch() {
  const { supabase } = await currentUser();
  const { data: items } = await supabase.from("tracker_items").select("id, stage");
  const count = (stage: string) => (items ?? []).filter((i) => i.stage === stage.toLowerCase()).length;

  return (
    <>
      <h1 className="text-title font-bold">My search</h1>
      {items?.length ? (
        <div className="mt-6 grid gap-4 md:grid-cols-5">
          {COLUMNS.map((c) => (
            <div key={c} className="bg-surface p-4 border border-border rounded-[var(--radius-card)]">
              <p className="text-body font-bold">{c} <span className="text-muted">{count(c)}</span></p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6">
          <Empty
            title="Your next move starts here."
            line="Save a job or add one you found elsewhere."
            action={<ButtonLink href="/jobs">Find jobs</ButtonLink>}
          />
        </div>
      )}
      <p className="mt-6 text-meta text-muted">Only you can see your tracker.</p>
    </>
  );
}
