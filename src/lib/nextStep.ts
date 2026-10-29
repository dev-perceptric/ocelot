// The short line under a tracker card. Part 2 adds the next task or interview ("Interview tomorrow").
import type { Stage } from "./tracker.ts";

const ago = (iso: string, now: Date) => {
  const d = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

export function nextStep(c: { stage: Stage; applied_at: string | null; created_at: string }, now = new Date()): string {
  if (c.stage === "saved") return "Add a next step";
  if (c.stage === "applied" && c.applied_at) return `Applied ${ago(c.applied_at, now)}`;
  if (c.stage === "applied") return `Added ${ago(c.created_at, now)}`;
  return "";
}
