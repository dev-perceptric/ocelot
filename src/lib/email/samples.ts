// Sample data for each email, for /admin/emails. Add a sample whenever a template is added.

import type { Email } from "./layout.ts";
import { applicationSent, newApplicant, stageUpdate, inviteAccepted, jobPublished, jobSentBack, reportReceived, teamInvite } from "./templates.ts";

export function samples(siteUrl: string): { kind: string; name: string; email: Email }[] {
  return [
    { kind: "team_invite", name: "Team invite", email: teamInvite({ company: "Example Co", inviter: "Ana Tran", role: "admin", url: `${siteUrl}/invite/sample`, expiresDays: 7 }) },
    { kind: "invite_accepted", name: "Invite accepted", email: inviteAccepted({ company: "Example Co", member: "Ben Le", teamUrl: `${siteUrl}/employer/team` }) },
    { kind: "job_published", name: "Job published", email: jobPublished({ company: "Example Co", title: "Marketing Manager", jobUrl: `${siteUrl}/jobs/sample`, manageUrl: `${siteUrl}/employer/jobs`, until: "28 November" }) },
    { kind: "report_received", name: "Report (to admins)", email: reportReceived({ job: "Marketing Manager", company: "Example Co", reason: "fee_required", details: "They asked for a training fee.", reviewUrl: `${siteUrl}/admin/reports` }) },
    { kind: "application_sent", name: "Application sent (to candidate)", email: applicationSent({ job: "Marketing Manager", company: "Example Co", cardUrl: `${siteUrl}/app/tracker` }) },
    { kind: "new_applicant", name: "New applicant (to company)", email: newApplicant({ company: "Example Co", job: "Marketing Manager", name: "Mai Nguyen", url: `${siteUrl}/employer/applicants`, siteUrl }) },
    { kind: "stage_interviewing", name: "Stage: interviewing (to candidate)", email: stageUpdate({ company: "Example Co", job: "Marketing Manager", stage: "interviewing", cardUrl: `${siteUrl}/app/tracker`, siteUrl }) },
    { kind: "stage_offer", name: "Stage: offer (to candidate)", email: stageUpdate({ company: "Example Co", job: "Marketing Manager", stage: "offer", cardUrl: `${siteUrl}/app/tracker`, siteUrl }) },
    { kind: "stage_hired", name: "Stage: hired (to candidate)", email: stageUpdate({ company: "Example Co", job: "Marketing Manager", stage: "hired", cardUrl: `${siteUrl}/app/tracker`, siteUrl }) },
    { kind: "stage_rejected", name: "Stage: not moving forward (to candidate)", email: stageUpdate({ company: "Example Co", job: "Marketing Manager", stage: "rejected", cardUrl: `${siteUrl}/app/tracker`, siteUrl }) },
    { kind: "job_sent_back", name: "Job sent back", email: jobSentBack({ title: "Marketing Manager", note: "Add the countries you can hire from.", editUrl: `${siteUrl}/employer/jobs` }) },
  ];
}
