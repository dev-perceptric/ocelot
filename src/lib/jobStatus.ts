import type { Tone } from "@/components/ui";

// How each job state is shown to employers. Labels stay plain; "rejected" reads as "Needs an update".
export const JOB_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_review: { label: "Pending review", tone: "warning" },
  rejected: { label: "Needs an update", tone: "warning" },
  published: { label: "Published", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
  suspended: { label: "Suspended", tone: "danger" },
};
