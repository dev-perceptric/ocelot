import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { myOrgs } from "@/lib/org";
import { JobForm } from "../JobForm";

export const metadata: Metadata = { title: "Post a job" };

export default async function NewJob() {
  const { supabase, current } = await myOrgs();
  if (!current) redirect("/employer");
  const { data: org } = await supabase.from("orgs").select("trusted, office_places").eq("id", current.id).single();
  return (
    <>
      <Link href="/employer/jobs" className="text-meta underline">Jobs</Link>
      <h1 className="mt-3 text-title font-bold">Post a job</h1>
      <div className="mt-8">
        <JobForm live={false} trusted={Boolean(org?.trusted)} values={{
          id: null, title: "", role: null, seniority: null, employment_type: "full_time", workplace: null,
          office_places: org?.office_places ?? [], eligible_countries: ["VN"], salary_min: "", salary_max: "",
          salary_currency: "USD", salary_period: "month", description: "", apply_method: "external", apply_url: "", questions: [],
        }} />
      </div>
    </>
  );
}
