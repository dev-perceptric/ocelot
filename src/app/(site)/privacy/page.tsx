import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy", alternates: { canonical: "/privacy" } };

const CONTACT = "hello@joinocelot.com";

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy"
      updated="29 October 2026"
      intro={<p>Ocelot is a job marketplace and a private job search workspace at joinocelot.com. This page explains what we collect, why, who can see it, and how you stay in control. Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>}
      sections={[
        {
          id: "collect", title: "What we collect", body: (
            <ul>
              <li><strong>Your account:</strong> your email address and how you sign in (an email code or Google).</li>
              <li><strong>Your profile:</strong> what you choose to add, such as your name, headline, city, experience, languages, links and the salary you&apos;re looking for.</li>
              <li><strong>Your job search:</strong> jobs you save or track, notes, tasks, interviews and résumés you upload.</li>
              <li><strong>Applications:</strong> what you send to a company when you apply through Ocelot.</li>
              <li><strong>Companies:</strong> company details, team members and job listings that employers add.</li>
              <li><strong>Emails:</strong> a record of the emails we send you (when, which kind, and whether it was delivered).</li>
              <li><strong>Technical data:</strong> basic server logs, such as IP address and browser, kept to run and protect the service.</li>
            </ul>
          ),
        },
        {
          id: "use", title: "How we use it", body: (
            <ul>
              <li>To run Ocelot: sign you in, show jobs, keep your tracker, send applications and manage hiring.</li>
              <li>To send the emails you need (sign-in codes, invites, application updates) and the ones you choose (alerts, the weekly digest).</li>
              <li>To keep the marketplace safe: review listings, handle reports, and stop scams and misuse.</li>
              <li>To improve Ocelot, using counts and trends, not to build advertising profiles. We don&apos;t sell personal data.</li>
            </ul>
          ),
        },
        {
          id: "who", title: "Who can see what", body: (
            <>
              <ul>
                <li><strong>Your tracker is private.</strong> Notes, tasks, interviews and jobs you track are visible only to you. Employers can&apos;t see them.</li>
                <li><strong>Your profile is private by default.</strong> A company sees your details only when you apply to it, as a copy of what you sent at that moment.</li>
                <li><strong>Résumés</strong> are stored privately. A company you applied to can open the résumé you sent through a short-lived link.</li>
                <li><strong>Job listings and company pages are public.</strong></li>
              </ul>
              <p>We use these service providers to run Ocelot, under contracts that limit how they use data:</p>
              <ul>
                <li>Supabase: database, sign-in and file storage (Singapore).</li>
                <li>Fly.io: the servers that run the website (Singapore).</li>
                <li>Resend: sending email.</li>
                <li>Google: only if you choose to sign in with Google.</li>
              </ul>
              <p>We share data with authorities only when the law requires it.</p>
            </>
          ),
        },
        {
          id: "where", title: "Where your data is kept", body: (
            <p>Ocelot&apos;s data is stored in Singapore. Some providers, such as our email provider, may process data in other countries. When data moves across borders, we use providers with appropriate safeguards and follow the rules that apply to those transfers.</p>
          ),
        },
        {
          id: "how-long", title: "How long we keep it", body: (
            <ul>
              <li>Your account, profile and tracker: until you delete your account.</li>
              <li>Applications you sent: a company keeps its hiring record after you delete your account, with your name, contact details and résumé removed.</li>
              <li>Email records and server logs: only as long as needed to run and protect the service.</li>
              <li>Backups: deleted data can remain in backups until those backups expire.</li>
            </ul>
          ),
        },
        {
          id: "rights", title: "Your choices and rights", body: (
            <>
              <ul>
                <li><strong>See and download your data:</strong> <Link href="/app/settings">Settings</Link>, Export my data.</li>
                <li><strong>Correct it:</strong> edit your <Link href="/app/profile">profile</Link> at any time.</li>
                <li><strong>Delete it:</strong> Settings, Delete account.</li>
                <li><strong>Choose your emails:</strong> Settings, or the unsubscribe link in any optional email.</li>
              </ul>
              <p>Depending on where you live, you may have further rights, for example under Vietnam&apos;s personal data protection rules: to withdraw consent, to object to or limit some uses, and to complain to the data protection authority. To use any of these rights, email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
            </>
          ),
        },
        {
          id: "cookies", title: "Cookies", body: (
            <p>We use only the cookies Ocelot needs to work: keeping you signed in and remembering which company you&apos;re working in. We don&apos;t use advertising cookies.</p>
          ),
        },
        {
          id: "age", title: "Age", body: (
            <p>Ocelot is for people aged 16 and over.</p>
          ),
        },
        {
          id: "changes", title: "Changes to this page", body: (
            <p>If we change how we handle personal data, we&apos;ll update this page and its date. For important changes, we&apos;ll tell you by email or in the app before they take effect.</p>
          ),
        },
      ]}
    />
  );
}
