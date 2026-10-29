import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Workspace } from "@/components/Workspace";
import { myOrgs } from "@/lib/org";
import { OrgSwitcher } from "./OrgSwitcher";

export const metadata: Metadata = { title: "For employers", robots: { index: false } };

export default async function EmployerLayout({ children }: { children: React.ReactNode }) {
  const { user, orgs, current } = await myOrgs();
  if (!user) redirect("/login?next=/employer");
  const nav = current
    ? [
        { href: "/employer", label: "Overview" },
        { href: "/employer/jobs", label: "Jobs" },
        { href: "/employer/applicants", label: "Applicants" },
        { href: "/employer/company", label: "Company" },
        { href: "/employer/team", label: "Team" },
        { href: "/employer/billing", label: "Billing" },
        { href: "/app", label: "My search" },
      ]
    : [{ href: "/employer", label: "Overview" }, { href: "/app", label: "My search" }];
  return (
    <Workspace
      email={user.email ?? ""}
      nav={nav}
      top={orgs.length > 1 && current ? <OrgSwitcher orgs={orgs} current={current.id} /> : null}
    >
      {children}
    </Workspace>
  );
}
