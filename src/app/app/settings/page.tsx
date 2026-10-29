import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { ButtonLink } from "@/components/ui";
import { DeleteAccount, EmailForm, NotificationSwitches } from "./SettingsForms";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login?next=/app/settings");
  const { data: prefs } = await supabase.from("notification_prefs").select("*").eq("user_id", user.id).maybeSingle();
  // Companies where this person is the only member go with the account; the dialog names them.
  const { data: mine } = await supabase.from("org_members").select("org_id, org:orgs(name)").eq("user_id", user.id);
  const ids = (mine ?? []).map((m) => m.org_id);
  const { data: teammates } = ids.length ? await supabase.from("org_members").select("org_id").in("org_id", ids) : { data: [] };
  const size = new Map<string, number>();
  (teammates ?? []).forEach((t) => size.set(t.org_id, (size.get(t.org_id) ?? 0) + 1));
  const solo = (mine ?? []).filter((m) => (size.get(m.org_id) ?? 1) === 1).map((m) => (m.org as unknown as { name: string })?.name);

  return (
    <>
      <h1 className="text-title font-bold">Settings</h1>
      <section className="mt-8 border-t border-border pt-6">
        <h2 className="text-card font-bold">Email address</h2>
        <p className="mt-1 text-body text-muted">You log in with {user.email}.</p>
        <div className="mt-4"><EmailForm current={user.email ?? ""} /></div>
      </section>
      <section className="mt-10 border-t border-border pt-6">
        <h2 className="text-card font-bold">Emails from Ocelot</h2>
        <div className="mt-2">
          <NotificationSwitches values={{
            application_updates: prefs?.application_updates ?? true,
            ...(mine?.length ? { new_applicants: prefs?.new_applicants ?? true } : {}),
            job_alerts: prefs?.job_alerts ?? true,
            weekly_digest: prefs?.weekly_digest ?? false,
            product_news: prefs?.product_news ?? false,
          }} />
        </div>
      </section>
      <section className="mt-10 border-t border-border pt-6">
        <h2 className="text-card font-bold">Your data</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <ButtonLink href="/api/me/export" variant="outline" prefetch={false}>Export my data</ButtonLink>
          <DeleteAccount email={user.email ?? ""} companies={solo} />
        </div>
      </section>
    </>
  );
}
