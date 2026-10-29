// Every email Ocelot sends, one function each. Add new ones here and to /admin/emails.

import { layout, optionalFooter, type Email } from "./layout.ts";

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

export function jobPublished(o: { company: string; title: string; jobUrl: string; manageUrl: string; until: string }): Email {
  return {
    subject: `${o.title} is live on Ocelot`,
    pref: null,
    ...layout({
      title: `${o.title} is live`,
      preview: `Candidates can find ${o.title} on Ocelot now.`,
      blocks: [
        { p: `${o.company}'s job ${o.title} passed review and is live on Ocelot until ${o.until}.` },
        { button: { label: "View the job", url: o.jobUrl } },
        { small: `Manage it any time: ${o.manageUrl}` },
      ],
    }),
  };
}

export function jobSentBack(o: { title: string; note: string; editUrl: string }): Email {
  return {
    subject: `${o.title} needs an update before it goes live`,
    pref: null,
    ...layout({
      title: "Your listing needs an update",
      preview: `${o.title} needs a change before it can go live.`,
      blocks: [
        { p: `${o.title} needs an update before it can go live on Ocelot.` },
        { p: `What to change: ${o.note}` },
        { button: { label: "Edit the job", url: o.editUrl } },
        { small: "After you edit it, send it for review again." },
      ],
    }),
  };
}

export const REPORT_REASONS: Record<string, string> = {
  scam: "Scam or fake job",
  fee_required: "Asks candidates to pay",
  misleading: "Misleading details",
  expired: "Already filled or closed",
  other: "Something else",
};

// To Ocelot's admins, so scams come down fast.
export function reportReceived(o: { job: string; company: string; reason: string; details: string; reviewUrl: string }): Email {
  return {
    subject: `Report: ${REPORT_REASONS[o.reason] ?? o.reason}, ${o.job} at ${o.company}`,
    pref: null,
    ...layout({
      title: "A job was reported",
      preview: `${o.job} at ${o.company}: ${REPORT_REASONS[o.reason] ?? o.reason}`,
      blocks: [
        { p: `${o.job} at ${o.company} was reported: ${REPORT_REASONS[o.reason] ?? o.reason}.` },
        ...(o.details ? [{ p: `Details: ${o.details}` }] : []),
        { button: { label: "Open reports", url: o.reviewUrl } },
      ],
    }),
  };
}

export function applicationSent(o: { job: string; company: string; cardUrl: string }): Email {
  return {
    subject: `Your application to ${o.company} was sent`,
    pref: null,
    ...layout({
      title: "Application sent",
      preview: `${o.job} at ${o.company}`,
      blocks: [
        { p: `We sent your application for ${o.job} to ${o.company}. When they move it forward, you'll see it on the job's card in your tracker.` },
        { button: { label: "View in My search", url: o.cardUrl } },
      ],
    }),
  };
}

export function newApplicant(o: { company: string; job: string; name: string; url: string; siteUrl: string }): Email {
  return {
    subject: `New applicant for ${o.job}: ${o.name}`,
    pref: "new_applicants",
    ...layout({
      title: `${o.name} applied`,
      preview: `${o.name} applied for ${o.job} at ${o.company}.`,
      blocks: [
        { p: `${o.name} applied for ${o.job} at ${o.company}.` },
        { button: { label: "View applicant", url: o.url } },
      ],
      footer: optionalFooter(o.siteUrl),
    }),
  };
}

// The hiring stages a candidate hears about. Reviewing stays inside the company.
export const STAGE_EMAIL = ["interviewing", "offer", "hired", "rejected"] as const;
export type StageEmail = (typeof STAGE_EMAIL)[number];

export function stageUpdate(o: { company: string; job: string; stage: StageEmail; cardUrl: string; siteUrl: string }): Email {
  const copy: Record<StageEmail, { subject: string; title: string; p: string }> = {
    interviewing: {
      subject: `${o.company} would like to interview you`,
      title: "Invited to interview",
      p: `${o.company} moved your application for ${o.job} to interviews. Watch your email and phone for their message about times.`,
    },
    offer: {
      subject: `Offer stage at ${o.company}`,
      title: "Offer stage",
      p: `${o.company} moved your application for ${o.job} to the offer stage.`,
    },
    hired: {
      subject: `Hired at ${o.company}`,
      title: "Congratulations",
      p: `${o.company} marked you as hired for ${o.job}.`,
    },
    rejected: {
      subject: `Update on your application to ${o.company}`,
      title: "Application update",
      p: `${o.company} has decided not to move forward with your application for ${o.job}. Thank you for applying through Ocelot.`,
    },
  };
  const c = copy[o.stage];
  return {
    subject: c.subject,
    pref: "application_updates",
    ...layout({
      title: c.title,
      preview: c.p,
      blocks: [{ p: c.p }, { button: { label: "View in My search", url: o.cardUrl } }],
      footer: optionalFooter(o.siteUrl),
    }),
  };
}
