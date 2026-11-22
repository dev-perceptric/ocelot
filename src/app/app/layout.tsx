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
      space="Job search"
      switchTo={{ href: "/employer", label: "Switch to hiring" }}
      nav={[
        { href: "/app", label: "Home", icon: "dashboard", exact: true },
        { href: "/jobs", label: "Find jobs", icon: "search" },
        { href: "/app/tracker", label: "Tracker", icon: "tracker", section: "Your search" },
        { href: "/app/tasks", label: "Tasks", icon: "tasks", section: "Your search" },
        { href: "/app/resumes", label: "Résumés", icon: "resume", section: "You" },
        { href: "/app/profile", label: "Profile", icon: "profile", section: "You" },
        { href: "/app/settings", label: "Settings", icon: "settings", section: "You" },
      ]}
    >
      {children}
    </Workspace>
  );
}
