import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

// src/lib/database.types.ts is made by `npm run types` (needs Docker, so it runs on a developer machine).
// This catches a migration that was added without running it again: every table and added column must be there.
const dir = new URL("../supabase/migrations/", import.meta.url);
const sql = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => readFileSync(new URL(f, dir), "utf8")).join("\n");
const types = readFileSync(new URL("../src/lib/database.types.ts", import.meta.url), "utf8");

test("every table is in the generated types", () => {
  const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);
  const missing = tables.filter((t) => !new RegExp(`"${t}": \\{\\s+Row:`).test(types));
  assert.deepEqual(missing, [], "run `npm run types` after changing migrations");
});

test("every added or renamed column is in the generated types", () => {
  const added = [...sql.matchAll(/add column (\w+)/g), ...sql.matchAll(/rename column \w+ to (\w+)/g)].map((m) => m[1]);
  const missing = [...new Set(added)].filter((c) => !new RegExp(`"${c}"\\??:`).test(types));
  assert.deepEqual(missing, [], "run `npm run types` after changing migrations");
});

const rowOf = (table: string) => types.match(new RegExp(`"${table}": \\{\\s+Row: \\{([^}]*)\\}`))?.[1] ?? "";

test("dropped columns are gone from the generated types", () => {
  const dropped = [...sql.matchAll(/alter table public\.(\w+) drop column (\w+)/g)].map((m) => [m[1], m[2]] as const);
  assert.ok(dropped.length > 0);
  const left = dropped.filter(([t, c]) => rowOf(t).includes(`"${c}":`)).map(([t, c]) => `${t}.${c}`);
  assert.deepEqual(left, [], "run `npm run types` after changing migrations");
});
