import { test } from "node:test";
import assert from "node:assert/strict";
import { nextStep } from "../src/lib/nextStep.ts";

const now = new Date("2026-11-02T03:00:00Z"); // Monday 10:00 in Vietnam
const base = { stage: "applied" as const, applied_at: "2026-10-31T03:00:00Z", created_at: "2026-10-30T03:00:00Z" };

test("an upcoming interview comes first", () => {
  assert.equal(nextStep({ ...base, interview: "2026-11-03T08:00:00Z", task: { title: "Send portfolio", due_at: null } }, undefined, now), "Interview tomorrow");
});
test("then the next task", () => {
  assert.equal(nextStep({ ...base, task: { title: "Follow up", due_at: "2026-11-06T02:00:00Z" } }, undefined, now), "Follow up, Friday");
  assert.equal(nextStep({ ...base, task: { title: "Follow up", due_at: "2026-10-30T02:00:00Z" } }, undefined, now), "Overdue: Follow up");
});
test("then where the card stands", () => {
  assert.equal(nextStep(base, undefined, now), "Applied 2 days ago");
  assert.equal(nextStep({ ...base, stage: "saved" }, undefined, now), "Add a next step");
});
test("a past interview doesn't count", () => {
  assert.equal(nextStep({ ...base, interview: "2026-10-25T08:00:00Z" }, undefined, now), "Applied 2 days ago");
});
