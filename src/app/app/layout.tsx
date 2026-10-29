import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Workspace } from "@/components/Workspace";
import { currentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My search", robots: { index: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await currentUser();
  if (!user) redirect("/login?next=/app");
  return (
    <Workspace
      email={user.email ?? ""}
      nav={[
        { href: "/app", label: "My search" },
        { href: "/app/tracker", label: "Tracker" },
        { href: "/app/profile", label: "Profile" },
        { href: "/app/settings", label: "Settings" },
        { href: "/jobs", label: "Find jobs" },
        { href: "/employer", label: "For employers" },
      ]}
    >
      {children}
    </Workspace>
  );
}
