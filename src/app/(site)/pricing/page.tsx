import type { Metadata } from "next";
import { ArrowRight, Check } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { dollars, PACKAGES, type PaidPackage } from "@/lib/packages";
import { currentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Post a job",
  description: "Post a marketing, sales or customer success job on Ocelot. Standard and featured listings, live for 30 days.",
  alternates: { canonical: "/pricing" },
};

const PERKS: Record<PaidPackage, string[]> = {
  standard: ["Live on Ocelot for 30 days", "Built to show up in Google job search", "Applicants and notes in one workspace"],
  featured: ["Everything in Standard", "Shown first in search for 7 days", "Sent in the weekly job digest"],
};

const STEPS = [
  ["Write the job", "The role, where you can hire from and the pay. It takes a few minutes."],
  ["Pay and publish", "Pay by card. Ocelot checks a new company's first job, then it goes live."],
  ["Hire", "Move applicants from New to Hired and keep private notes with your team."],
];

export default async function Pricing() {
  // Signed in: straight to the job form. Signed out: create an account (or log in from there), then the form.
  const { user } = await currentUser();
  const post = user ? "/employer/jobs/new" : `/signup?next=${encodeURIComponent("/employer/jobs/new")}`;

  return (
    <>
      <section className="bg-canvas">
        <div className="mx-auto max-w-[1200px] px-5 py-14 md:px-8 md:py-20">
          <h1 className="text-display-sm font-black md:text-display">
            Meet your next <span className="highlight">great hire.</span>
          </h1>
          <p className="mt-6 max-w-[60ch] font-[family-name:var(--font-editorial)] text-lede">
            Reach people looking for their next job, wherever they are. Post now, no call or contract needed.
          </p>

          <div className="mt-10 grid max-w-[900px] gap-4 md:grid-cols-2">
            {(Object.keys(PACKAGES) as PaidPackage[]).map((key) => {
              const p = PACKAGES[key];
              const main = key === "standard";
              return (
                <div key={key} className={`flex flex-col border bg-surface p-6 rounded-[var(--radius-card)] md:p-8 ${main ? "border-ink" : "border-border"}`}>
                  <h2 className="text-card font-bold">{p.name}</h2>
                  <p className="mt-3"><span className="text-display-sm font-black">{dollars(p.cents)}</span> <span className="text-body text-muted">per job</span></p>
                  <ul className="mt-6 flex flex-1 flex-col gap-3">
                    {PERKS[key].map((line) => (
                      <li key={line} className="flex items-start gap-2 text-body">
                        <Check size={20} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />{line}
                      </li>
                    ))}
                  </ul>
                  <ButtonLink href={post} variant={main ? "primary" : "outline"} className="mt-8 self-start">
                    Post a job <ArrowRight size={18} strokeWidth={2} aria-hidden />
                  </ButtonLink>
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-meta text-muted">You choose Standard or Featured when you send the job. Founding employers post for free during the beta.</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1200px] gap-8 px-5 py-16 md:grid-cols-3 md:px-8">
        {STEPS.map(([title, line], i) => (
          <div key={title}>
            <p className="text-meta font-bold text-muted">Step {i + 1}</p>
            <h2 className="mt-1 text-card font-bold">{title}</h2>
            <p className="mt-2 text-body text-muted">{line}</p>
          </div>
        ))}
      </section>
    </>
  );
}
