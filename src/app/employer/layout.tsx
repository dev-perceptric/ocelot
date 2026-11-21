import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Workspace } from "@/components/Workspace";
import { myOrgs } from "@/lib/org";
import { AgencySwitcher, OrgSwitcher } from "./OrgSwitcher";

export const metadata: Metadata = { title: "For employers", robots: { index: false } };

export default async function EmployerLayout({ children }: { children: React.ReactNode }) {
  const { user, orgs, current, agencies, agency } = await myOrgs();
  if (!user) redirect("/login?next=/employer");
  const nav = [
    { href: "/employer", label: "Overview" },
    ...(current ? [
      { href: "/employer/jobs", label: "Jobs" },
      { href: "/employer/applicants", label: "Applicants" },
      { href: "/employer/company", label: "Company" },
      { href: "/employer/team", label: "Team" },
      { href: "/employer/billing", label: "Billing" },
    ] : []),
    ...(agency ? [
      { href: "/employer/agency", label: "Agency" },
      { href: "/employer/agency/team", label: "Agency team" },
      { href: "/employer/agency/billing", label: "Agency billing" },
    ] : []),
    { href: "/app", label: "My search" },
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
    <Workspace email={user.email ?? ""} nav={nav} top={top}>
      {children}
    </Workspace>
  );
}
