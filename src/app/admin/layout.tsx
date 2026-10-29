import type { Metadata } from "next";
import { Workspace } from "@/components/Workspace";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  return (
    <Workspace
      email={user.email ?? ""}
      nav={[
        { href: "/admin", label: "Overview" },
        { href: "/admin/review", label: "Review" },
        { href: "/admin/reports", label: "Reports" },
        { href: "/admin/companies", label: "Companies" },
        { href: "/admin/billing", label: "Billing" },
        { href: "/admin/people", label: "People" },
        { href: "/admin/queue", label: "Queue" },
        { href: "/admin/emails", label: "Emails" },
        { href: "/admin/audit", label: "Audit log" },
        { href: "/admin/ui", label: "Parts" },
      ]}
    >
      {children}
    </Workspace>
  );
}
