import { test } from "node:test";
import assert from "node:assert/strict";
import { deletionPlan } from "../src/lib/account.ts";

test("the only owner of a team must hand over first", () => {
  const p = deletionPlan([{ orgId: "a", name: "Acme", role: "owner", members: 3, owners: 1 }]);
  assert.deepEqual(p.blockers.map((b) => b.name), ["Acme"]);
  assert.deepEqual(p.companiesToDelete, []);
});

test("one of several owners, an admin or a member can leave", () => {
  const p = deletionPlan([
    { orgId: "a", name: "Acme", role: "owner", members: 3, owners: 2 },
    { orgId: "b", name: "Beta", role: "admin", members: 2, owners: 1 },
    { orgId: "c", name: "Cee", role: "member", members: 5, owners: 1 },
  ]);
  assert.deepEqual(p.blockers, []);
  assert.deepEqual(p.companiesToDelete, []);
});

test("a company with nobody else in it is deleted too", () => {
  const p = deletionPlan([{ orgId: "s", name: "Solo", role: "owner", members: 1, owners: 1 }]);
  assert.deepEqual(p.blockers, []);
  assert.deepEqual(p.companiesToDelete.map((c) => c.name), ["Solo"]);
});
