// The company's hiring stages. Separate from the candidate's own tracker stages (src/lib/tracker.ts).

export const HIRING_STAGES = ["new", "reviewing", "interviewing", "offer", "hired", "rejected", "withdrawn"] as const;
export type HiringStage = (typeof HIRING_STAGES)[number];

// What the company can move an applicant to. Withdrawn is the candidate's own step.
export const SETTABLE: HiringStage[] = ["new", "reviewing", "interviewing", "offer", "hired", "rejected"];

export const HIRING_LABEL: Record<HiringStage, string> = {
  new: "New", reviewing: "Reviewing", interviewing: "Interviewing", offer: "Offer", hired: "Hired",
  rejected: "Not moving forward", withdrawn: "Withdrawn",
};
export const HIRING_TONE: Record<HiringStage, "neutral" | "info" | "progress" | "warning" | "success" | "danger"> = {
  new: "info", reviewing: "neutral", interviewing: "progress", offer: "warning", hired: "success", rejected: "neutral", withdrawn: "neutral",
};

// What the candidate sees on their card. Reviewing stays inside the company.
export const CANDIDATE_LABEL: Partial<Record<HiringStage, string>> = {
  new: "Received", interviewing: "Invited to interview", offer: "Offer", hired: "Hired", rejected: "Not moving forward", withdrawn: "Withdrawn",
};

export const isHiringStage = (s: string): s is HiringStage => (HIRING_STAGES as readonly string[]).includes(s);
export const isSettable = (s: string): s is HiringStage => (SETTABLE as string[]).includes(s);
