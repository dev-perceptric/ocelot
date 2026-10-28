import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLACES } from "../src/lib/places.ts";
import { CURRENCIES, ROLES } from "../src/lib/taxonomy.ts";

// The code's lists and the database's lists must match, or forms offer values the database refuses.
const sql = readFileSync(new URL("../supabase/migrations/003_lists_and_profiles.sql", import.meta.url), "utf8");

test("places match the database", () => {
  const rows = [...sql.matchAll(/\('([a-z0-9-]+)', '(country|city)', '([^']+)', '([A-Z]{2})', \d+\)/g)]
    .map(([, slug, kind, name, country_code]) => ({ slug, kind, name, country_code }));
  assert.ok(rows.length > 40);
  assert.deepEqual(PLACES, rows);
});

test("every city's country is on the list", () => {
  const codes = new Set(PLACES.filter((p) => p.kind === "country").map((p) => p.country_code));
  for (const city of PLACES.filter((p) => p.kind === "city")) assert.ok(codes.has(city.country_code), city.slug);
});

test("roles match the database", () => {
  const rows = [...sql.matchAll(/\('([a-z0-9_]+)', '(marketing|sales|customer_success|other)', '([^']+)', \d+\)/g)]
    .map(([, slug, category, name]) => ({ slug, category, name }));
  assert.deepEqual(ROLES, rows);
});

test("currencies match the database", () => {
  const checks = [...sql.matchAll(/in \(('[A-Z]{3}'(?:, '[A-Z]{3}')*)\)/g)].map((m) => m[1].replace(/'/g, "").split(", "));
  assert.equal(checks.length, 2);
  for (const list of checks) assert.deepEqual(list, [...CURRENCIES]);
});
