import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CANDIDATE_LABEL, HIRING_STAGES, SETTABLE, isSettable } from "../src/lib/hiring.ts";

test("hiring stages match the database list", () => {
  const sql = readFileSync(new URL("../supabase/migrations/001_foundation.sql", import.meta.url), "utf8");
  const list = sql.match(/hiring_stage in \(([^)]+)\)/)![1].split(",").map((s) => s.trim().replace(/'/g, ""));
  assert.deepEqual([...HIRING_STAGES], list);
});
test("companies can't set Withdrawn and candidates never see Reviewing", () => {
  assert.ok(!SETTABLE.includes("withdrawn") && !isSettable("withdrawn") && isSettable("rejected"));
  assert.equal(CANDIDATE_LABEL.reviewing, undefined);
});
