import { test } from "node:test";
import assert from "node:assert/strict";
import { bucket, clock, dayKey, relativeDay, zonedToUtc } from "../src/lib/when.ts";

const HCM = "Asia/Ho_Chi_Minh"; // UTC+7, no daylight saving

test("a wall-clock time in a zone becomes the right moment", () => {
  assert.equal(zonedToUtc("2026-11-03", "15:00", HCM).toISOString(), "2026-11-03T08:00:00.000Z");
  assert.equal(zonedToUtc("2026-11-03", "", HCM).toISOString(), "2026-11-03T02:00:00.000Z", "no time means 09:00");
  // Daylight saving: 10:00 in London is 09:00 UTC in summer and 10:00 UTC in winter.
  assert.equal(zonedToUtc("2026-07-01", "10:00", "Europe/London").toISOString(), "2026-07-01T09:00:00.000Z");
  assert.equal(zonedToUtc("2026-12-01", "10:00", "Europe/London").toISOString(), "2026-12-01T10:00:00.000Z");
});

test("days are counted in the person's zone", () => {
  // 20:00 UTC on 2 Nov is already 3 Nov in Vietnam.
  assert.equal(dayKey("2026-11-02T20:00:00Z", HCM), "2026-11-03");
  assert.equal(clock("2026-11-03T08:00:00Z", HCM), "15:00");
});

test("relative days read naturally", () => {
  const now = new Date("2026-11-02T03:00:00Z"); // Monday 2 Nov, 10:00 in Vietnam
  assert.equal(relativeDay("2026-11-02T10:00:00Z", HCM, now), "today");
  assert.equal(relativeDay("2026-11-03T02:00:00Z", HCM, now), "tomorrow");
  assert.equal(relativeDay("2026-11-01T02:00:00Z", HCM, now), "yesterday");
  assert.equal(relativeDay("2026-11-06T02:00:00Z", HCM, now), "Friday");
  assert.equal(relativeDay("2026-11-20T02:00:00Z", HCM, now), "20 Nov");
  assert.equal(relativeDay("2027-01-05T02:00:00Z", HCM, now), "5 Jan 2027");
});

test("tasks fall into overdue, today, upcoming or no date", () => {
  const now = new Date("2026-11-02T03:00:00Z");
  assert.equal(bucket("2026-11-01T02:00:00Z", HCM, now), "overdue");
  assert.equal(bucket("2026-11-02T16:00:00Z", HCM, now), "today", "23:00 in Vietnam is still today");
  assert.equal(bucket("2026-11-02T17:30:00Z", HCM, now), "upcoming", "00:30 the next day in Vietnam");
  assert.equal(bucket(null, HCM, now), "someday");
});
