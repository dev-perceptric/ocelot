import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms", alternates: { canonical: "/terms" } };

const CONTACT = "hello@joinocelot.com";

export default function Terms() {
  return (
    <LegalPage
      title="Terms"
      updated="29 October 2026"
      intro={<p>These terms cover your use of Ocelot at joinocelot.com. By creating an account or using Ocelot, you agree to them. Our <Link href="/privacy">Privacy page</Link> explains how we handle personal data.</p>}
      sections={[
        {
          id: "about", title: "What Ocelot is", body: (
            <p>Ocelot lets companies publish jobs and manage applicants, and lets people find jobs and organize their job search. Ocelot is a marketplace. We aren&apos;t the employer for any job listed, and we aren&apos;t a recruitment agency. We don&apos;t promise that anyone will get a job, an interview or a hire.</p>
          ),
        },
        {
          id: "accounts", title: "Your account", body: (
            <ul>
              <li>You must be 16 or older.</li>
              <li>Give accurate information and keep it up to date.</li>
              <li>An account is for one person. Keep access to your email secure, since it&apos;s how you sign in.</li>
              <li>You&apos;re responsible for what happens in your account.</li>
            </ul>
          ),
        },
        {
          id: "candidates", title: "For candidates", body: (
            <ul>
              <li>When you apply through Ocelot, the company receives what you send. Each company decides how it hires and whether it replies.</li>
              <li>Some jobs send you to the company&apos;s own site to apply. That site&apos;s terms apply there.</li>
              <li>Your tracker is for your own use. Don&apos;t upload other people&apos;s personal data to it without a good reason.</li>
            </ul>
          ),
        },
        {
          id: "employers", title: "For employers", body: (
            <>
              <p>If you post jobs or manage applicants for a company, you confirm that you&apos;re allowed to act for that company, and you agree to:</p>
              <ul>
                <li>Post only real, open jobs, with accurate details, including where you can hire from and pay when you share it.</li>
                <li>Never ask candidates to pay a fee to apply, interview, train or be hired.</li>
                <li>Follow the employment, anti-discrimination and data protection laws that apply to your hiring.</li>
                <li>Use applicants&apos; information only to consider them for the role they applied to, and keep it secure.</li>
                <li>Keep your company profile accurate. &quot;Email verified&quot; and &quot;Company verified&quot; describe the checks we made, and nothing more.</li>
              </ul>
              <p>We review listings before they go live and may ask for changes, refuse a listing or remove it.</p>
            </>
          ),
        },
        {
          id: "paid", title: "Paid listings", body: (
            <p>Some listings may cost money. We show the price, what it includes and how long the listing runs before you pay. A paid listing period starts when the listing is published. If we don&apos;t publish a paid listing after review, you get the listing credit back or a refund.</p>
          ),
        },
        {
          id: "not-allowed", title: "What's not allowed", body: (
            <ul>
              <li>Scams, fake jobs, pyramid schemes, or listings that collect personal data for other purposes.</li>
              <li>Harassment, discrimination or misleading anyone.</li>
              <li>Copying Ocelot&apos;s listings or data in bulk, or using bots to access Ocelot without our permission.</li>
              <li>Trying to get around security, or into accounts or data that aren&apos;t yours.</li>
            </ul>
          ),
        },
        {
          id: "content", title: "Your content", body: (
            <p>You keep ownership of what you add to Ocelot. You let us store it, show it as the service needs (for example, showing a published listing publicly and in job search results, including search engines), and use it to run and improve Ocelot.</p>
          ),
        },
        {
          id: "ending", title: "Suspending or closing accounts", body: (
            <p>You can delete your account at any time in <Link href="/app/settings">Settings</Link>. We may suspend or close an account or company, or remove listings, that break these terms or put people at risk. Where we can, we&apos;ll tell you why.</p>
          ),
        },
        {
          id: "liability", title: "Responsibility", body: (
            <p>We work to keep Ocelot available and accurate, but we provide it as it is, without guarantees that it will always be available or error-free. Companies are responsible for their listings and hiring decisions. As far as the law allows, we aren&apos;t responsible for losses that come from using Ocelot, from listings, or from dealings between candidates and companies. Nothing here limits rights you have by law that can&apos;t be limited.</p>
          ),
        },
        {
          id: "changes", title: "Changes to these terms", body: (
            <p>We may update these terms. We&apos;ll change the date above, and for important changes we&apos;ll tell you by email or in the app before they take effect. Using Ocelot after that means you accept the new terms.</p>
          ),
        },
        {
          id: "contact", title: "Contact", body: (
            <p>Questions about these terms, or to report a listing: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
          ),
        },
      ]}
    />
  );
}
