import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Workspace } from "@/components/Workspace";
import { currentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "For employers", robots: { index: false } };

export default async function EmployerLayout({ children }: { children: React.ReactNode }) {
  const { user } = await currentUser();
  if (!user) redirect("/login?next=/employer");
  return (
    <Workspace
      email={user.email ?? ""}
      nav={[
        { href: "/employer", label: "Overview" },
        { href: "/app", label: "My search" },
      ]}
    >
      {children}
    </Workspace>
  );
}
