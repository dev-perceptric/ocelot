import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Workspace, type NavItem } from "@/components/Workspace";
import { myOrgs } from "@/lib/org";
import { AgencySwitcher, OrgSwitcher } from "./OrgSwitcher";

export const metadata: Metadata = { title: "For employers", robots: { index: false } };

export default async function EmployerLayout({ children }: { children: React.ReactNode }) {
  const { user, orgs, current, agencies, agency } = await myOrgs();
  if (!user) redirect("/login?next=/employer");
  const nav: NavItem[] = [
    { href: "/employer", label: "Overview", icon: "dashboard", exact: true },
    ...(current ? [
      { href: "/employer/jobs", label: "Jobs", icon: "jobs", section: "Hiring" },
      { href: "/employer/applicants", label: "Applicants", icon: "applicants", section: "Hiring" },
      { href: "/employer/company", label: "Company", icon: "company", section: current.name },
      { href: "/employer/team", label: "Team", icon: "team", section: current.name },
      { href: "/employer/billing", label: "Billing", icon: "billing", section: current.name },
    ] satisfies NavItem[] : []),
    ...(agency ? [
      { href: "/employer/agency", label: "Clients", icon: "agency", section: agency.name, exact: true },
      { href: "/employer/agency/team", label: "Agency team", icon: "team", section: agency.name },
      { href: "/employer/agency/billing", label: "Agency billing", icon: "billing", section: agency.name },
    ] satisfies NavItem[] : []),
  ];
  const ownGroup = agencies.length ? "Your companies" : undefined;
  const top = (
    <>
      {agencies.length > 1 && agency ? <AgencySwitcher agencies={agencies} current={agency.id} /> : null}
      {orgs.length > 1 && current ? (
        <OrgSwitcher orgs={orgs.map((o) => ({ id: o.id, name: o.name, group: o.teamRole ? ownGroup : o.agency?.name }))} current={current.id} />
      ) : null}
    </>
  );
  return (
    <Workspace email={user.email ?? ""} nav={nav} top={top} space="Hiring" switchTo={{ href: "/app", label: "Switch to job search" }}>
      {children}
    </Workspace>
  );
}
