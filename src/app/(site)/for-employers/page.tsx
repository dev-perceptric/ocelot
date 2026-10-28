import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = { title: "For employers", alternates: { canonical: "/for-employers" } };

const STEPS = [
  ["Draft", "Write the role, where you can hire from and the pay."],
  ["Review", "Ocelot checks every new company's first listing before it goes live."],
  ["Hire", "Move applicants from New to Hired and keep private notes with your team."],
];

export default function ForEmployers() {
  return (
    <>
      <section className="bg-canvas">
        <div className="mx-auto max-w-[1200px] px-5 py-16 md:px-8 md:py-24">
          <h1 className="text-display-sm font-black md:text-display">
            Meet your next
            <br />
            <span className="highlight">great hire.</span>
          </h1>
          <p className="mt-6 max-w-[60ch] font-[family-name:var(--font-editorial)] text-lede">
            Publish a role and manage applicants in one straightforward workspace. Founding employers post for free during the beta.
          </p>
          <ButtonLink href="/employer" variant="secondary" className="mt-8">Post a job</ButtonLink>
        </div>
      </section>
      <section className="mx-auto grid max-w-[1200px] gap-8 px-5 py-16 md:grid-cols-3 md:px-8">
        {STEPS.map(([title, line]) => (
          <div key={title}>
            <h2 className="text-card font-bold">{title}</h2>
            <p className="mt-2 text-body text-muted">{line}</p>
          </div>
        ))}
      </section>
    </>
  );
}
