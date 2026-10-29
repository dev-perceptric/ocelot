// The short line under a tracker card: the next interview, else the next task, else where it stands.
import type { Stage } from "./tracker.ts";
import { bucket, relativeDay } from "./when.ts";

const ago = (iso: string, now: Date) => {
  const d = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

export function nextStep(
  c: { stage: Stage; applied_at: string | null; created_at: string; interview?: string | null; task?: { title: string; due_at: string | null } | null },
  tz = "Asia/Ho_Chi_Minh",
  now = new Date(),
): string {
  if (c.interview && Date.parse(c.interview) >= now.getTime() - 2 * 3_600_000) return `Interview ${relativeDay(c.interview, tz, now)}`;
  if (c.task) {
    if (!c.task.due_at) return c.task.title;
    return bucket(c.task.due_at, tz, now) === "overdue" ? `Overdue: ${c.task.title}` : `${c.task.title}, ${relativeDay(c.task.due_at, tz, now)}`;
  }
  if (c.stage === "saved") return "Add a next step";
  if (c.stage === "applied" && c.applied_at) return `Applied ${ago(c.applied_at, now)}`;
  if (c.stage === "applied") return `Added ${ago(c.created_at, now)}`;
  return "";
}
