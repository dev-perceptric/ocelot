// Sample data for each email, for /admin/emails. Add a sample whenever a template is added.

import type { Email } from "./layout.ts";
import { inviteAccepted, teamInvite } from "./templates.ts";

export function samples(siteUrl: string): { kind: string; name: string; email: Email }[] {
  return [
    { kind: "team_invite", name: "Team invite", email: teamInvite({ company: "Example Co", inviter: "Ana Tran", role: "admin", url: `${siteUrl}/invite/sample`, expiresDays: 7 }) },
    { kind: "invite_accepted", name: "Invite accepted", email: inviteAccepted({ company: "Example Co", member: "Ben Le", teamUrl: `${siteUrl}/employer/team` }) },
  ];
}
