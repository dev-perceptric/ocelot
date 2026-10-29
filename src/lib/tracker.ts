// Tracker stages, labels and the card form. Plain functions, so tests can load them.

export const OPEN_STAGES = ["saved", "applied", "interviewing", "offer", "accepted"] as const;
export const CLOSED_STAGES = ["rejected", "withdrawn", "archived"] as const;
export const STAGES = [...OPEN_STAGES, ...CLOSED_STAGES] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  saved: "Saved", applied: "Applied", interviewing: "Interviewing", offer: "Offer", accepted: "Accepted",
  rejected: "Rejected", withdrawn: "Withdrawn", archived: "Archived",
};

// Brand rule: status has a text label; Saved, Rejected, Withdrawn and Archived are neutral.
export const STAGE_TONE: Record<Stage, "neutral" | "info" | "progress" | "success"> = {
  saved: "neutral", applied: "info", interviewing: "progress", offer: "success", accepted: "success",
  rejected: "neutral", withdrawn: "neutral", archived: "neutral",
};

export const isStage = (s: unknown): s is Stage => typeof s === "string" && (STAGES as readonly string[]).includes(s);

type FormLike = { get(name: string): unknown };
export type CardInput = { title: string; company: string; url: string | null; location: string | null; salary: string | null; stage: Stage; notes: string };
export type CardErrors = Partial<Record<keyof CardInput, string>>;

const text = (f: FormLike, k: string) => String(f.get(k) ?? "").trim();

export function readCard(f: FormLike, { requireStage = true } = {}): { data?: CardInput; errors: CardErrors } {
  const errors: CardErrors = {};
  const title = text(f, "title");
  if (!title) errors.title = "Add the job title.";
  else if (title.length > 200) errors.title = "Keep the title under 200 characters.";
  const company = text(f, "company");
  if (company.length > 200) errors.company = "Keep the company under 200 characters.";

  let url: string | null = null;
  const raw = text(f, "url");
  if (raw) {
    try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (!/\./.test(u.hostname) || u.toString().length > 2000) throw new Error();
      url = u.toString();
    } catch {
      errors.url = "Enter the job's web address, like company.com/jobs/123.";
    }
  }
  const location = text(f, "location");
  if (location.length > 200) errors.location = "Keep this under 200 characters.";
  const salary = text(f, "salary");
  if (salary.length > 100) errors.salary = "Keep this under 100 characters.";
  const notes = text(f, "notes");
  if (notes.length > 20000) errors.notes = "Keep notes under 20,000 characters.";
  const stageRaw = text(f, "stage") || "saved";
  if (!isStage(stageRaw) && requireStage) errors.stage = "Choose a stage.";

  if (Object.keys(errors).length) return { errors };
  return { errors, data: { title, company, url, location: location || null, salary: salary || null, stage: isStage(stageRaw) ? stageRaw : "saved", notes } };
}

export type Contact = { name: string; role: string; email: string; phone: string };

// Contacts as people type them: blank rows dropped, at most 20, each field kept short.
export function cleanContacts(list: unknown): Contact[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((c) => ({
      name: String(c?.name ?? "").trim().slice(0, 120),
      role: String(c?.role ?? "").trim().slice(0, 120),
      email: String(c?.email ?? "").trim().slice(0, 200),
      phone: String(c?.phone ?? "").trim().slice(0, 40),
    }))
    .filter((c) => c.name || c.email || c.phone)
    .slice(0, 20);
}

// Where a dropped card goes in its column: between its neighbours, or after the last one.
export function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 1000;
  if (before === null) return (after as number) - 1000;
  if (after === null) return before + 1000;
  return (before + after) / 2;
}
