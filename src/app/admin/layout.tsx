import type { Metadata } from "next";
import { Workspace } from "@/components/Workspace";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  return (
    <Workspace
      email={user.email ?? ""}
      space="Admin"
      switchTo={{ href: "/app", label: "Back to job search" }}
      nav={[
        { href: "/admin", label: "Overview", icon: "dashboard", exact: true },
        { href: "/admin/review", label: "Review", icon: "review", section: "Moderation" },
        { href: "/admin/reports", label: "Reports", icon: "reports", section: "Moderation" },
        { href: "/admin/companies", label: "Companies", icon: "company", section: "Accounts" },
        { href: "/admin/agencies", label: "Agencies", icon: "agency", section: "Accounts" },
        { href: "/admin/people", label: "People", icon: "people", section: "Accounts" },
        { href: "/admin/billing", label: "Billing", icon: "billing", section: "Accounts" },
        { href: "/admin/sources", label: "Job boards", icon: "sources", section: "System" },
        { href: "/admin/queue", label: "Queue", icon: "queue", section: "System" },
        { href: "/admin/emails", label: "Emails", icon: "emails", section: "System" },
        { href: "/admin/audit", label: "Audit log", icon: "audit", section: "System" },
        { href: "/admin/ui", label: "Parts", icon: "parts", section: "System" },
      ]}
    >
      {children}
    </Workspace>
  );
}
