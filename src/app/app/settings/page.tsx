import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { EmailForm, NotificationSwitches } from "./SettingsForms";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login?next=/app/settings");
  const { data: prefs } = await supabase.from("notification_prefs").select("*").eq("user_id", user.id).maybeSingle();

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
            job_alerts: prefs?.job_alerts ?? true,
            weekly_digest: prefs?.weekly_digest ?? false,
            product_news: prefs?.product_news ?? false,
          }} />
        </div>
      </section>
    </>
  );
}
