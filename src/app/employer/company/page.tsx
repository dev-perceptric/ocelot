import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Tag } from "@/components/ui";
import { canManage, myOrgs } from "@/lib/org";
import { CompanyForm } from "./CompanyForm";

export const metadata: Metadata = { title: "Company" };
export const dynamic = "force-dynamic";

export default async function CompanyPage() {
  const { supabase, current } = await myOrgs();
  if (!current) redirect("/employer");
  const { data: org } = await supabase.from("orgs").select("*").eq("id", current.id).single();
  if (!org) redirect("/employer");

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-title font-bold">Company</h1>
        {org.business_verified_at ? <Tag tone="success">Company verified</Tag> : null}
        {org.email_verified_domain ? <Tag tone="info">Email verified</Tag> : null}
      </div>
      <p className="mt-2 text-body text-muted">
        Public page: <Link href={`/companies/${org.slug}`} className="underline">joinocelot.com/companies/{org.slug}</Link>
      </p>
      <div className="mt-8">
        <CompanyForm
          canEdit={canManage(current.role)}
          values={{
            id: org.id, name: org.name, slug: org.slug, website: org.website ?? "", about: org.about ?? "", size: org.size,
            industry: org.industry ?? "", office_places: org.office_places ?? [], logo_url: org.logo_url,
          }}
        />
      </div>
    </>
  );
}
