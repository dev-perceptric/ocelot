// Every email Ocelot sends, one function each. Add new ones here and to /admin/emails.

import { layout, type Email } from "./layout.ts";

const ROLE: Record<string, string> = { owner: "an owner", admin: "an admin", member: "a member" };

export function teamInvite(o: { company: string; inviter: string; role: string; url: string; expiresDays: number }): Email {
  const title = `Join ${o.company} on Ocelot`;
  return {
    subject: `${o.inviter} invited you to ${o.company} on Ocelot`,
    pref: null,
    ...layout({
      title,
      preview: `${o.inviter} invited you to hire with ${o.company}.`,
      blocks: [
        { p: `${o.inviter} invited you to join ${o.company} as ${ROLE[o.role] ?? "a member"}. You'll see the company's jobs and applicants.` },
        { button: { label: "Accept invite", url: o.url } },
        { small: `This invite works for ${o.expiresDays} days. Sign in with this email address to accept it.` },
      ],
    }),
  };
}

export function inviteAccepted(o: { company: string; member: string; teamUrl: string }): Email {
  return {
    subject: `${o.member} joined ${o.company} on Ocelot`,
    pref: null,
    ...layout({
      title: `${o.member} joined ${o.company}`,
      preview: `${o.member} accepted your invite.`,
      blocks: [
        { p: `${o.member} accepted your invite and can now see ${o.company}'s jobs and applicants.` },
        { button: { label: "View team", url: o.teamUrl } },
      ],
    }),
  };
}
