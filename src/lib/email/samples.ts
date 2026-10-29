// Sample data for each email, for /admin/emails. Add a sample whenever a template is added.

import type { Email } from "./layout.ts";
import { applicationSent, inviteAccepted, jobPublished, jobSentBack, reportReceived, teamInvite } from "./templates.ts";

export function samples(siteUrl: string): { kind: string; name: string; email: Email }[] {
  return [
    { kind: "team_invite", name: "Team invite", email: teamInvite({ company: "Example Co", inviter: "Ana Tran", role: "admin", url: `${siteUrl}/invite/sample`, expiresDays: 7 }) },
    { kind: "invite_accepted", name: "Invite accepted", email: inviteAccepted({ company: "Example Co", member: "Ben Le", teamUrl: `${siteUrl}/employer/team` }) },
    { kind: "job_published", name: "Job published", email: jobPublished({ company: "Example Co", title: "Marketing Manager", jobUrl: `${siteUrl}/jobs/sample`, manageUrl: `${siteUrl}/employer/jobs`, until: "28 November" }) },
    { kind: "report_received", name: "Report (to admins)", email: reportReceived({ job: "Marketing Manager", company: "Example Co", reason: "fee_required", details: "They asked for a training fee.", reviewUrl: `${siteUrl}/admin/reports` }) },
    { kind: "application_sent", name: "Application sent (to candidate)", email: applicationSent({ job: "Marketing Manager", company: "Example Co", cardUrl: `${siteUrl}/app/tracker` }) },
    { kind: "job_sent_back", name: "Job sent back", email: jobSentBack({ title: "Marketing Manager", note: "Add the countries you can hire from.", editUrl: `${siteUrl}/employer/jobs` }) },
  ];
}
