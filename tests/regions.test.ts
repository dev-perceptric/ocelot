import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CITY_REGION, regionsIn, REGIONS } from "../src/lib/regions.ts";
import { CITIES } from "../src/lib/places.ts";

test("states and provinces read from job locations", () => {
  const cases: [string, string[]][] = [
    ["Austin, TX", ["US-TX"]], ["Toronto, ON, CA", ["CA-ON"]], ["Remote - Texas", ["US-TX"]], ["Ontario, Canada", ["CA-ON"]],
    ["New York, NY", ["US-NY"]], ["New York City", []], ["Seattle, Washington", ["US-WA"]], ["Washington, DC", ["US-DC"]],
    ["Remote, in the US", []], ["San Francisco, CA", ["US-CA"]], ["Georgia", []], ["Kansas City, MO", ["US-MO"]],
    ["Charleston, West Virginia", ["US-WV"]], ["Vancouver, British Columbia", ["CA-BC"]],
  ];
  for (const [text, want] of cases) assert.deepEqual(regionsIn([text]).sort(), want, text);
  assert.equal(REGIONS.length, 51 + 13);
});

test("every US and Canadian city has its state, the same as the database", () => {
  for (const c of CITIES.filter((c) => c.country_code === "US" || c.country_code === "CA")) assert.ok(CITY_REGION[c.slug]?.startsWith(c.country_code), c.slug);
  const sql = readFileSync(new URL("../supabase/migrations/028_regions.sql", import.meta.url), "utf8");
  const rows = Object.fromEntries([...sql.matchAll(/\('([a-z-]+)', '((?:US|CA)-[A-Z]{2})'\)/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(rows, CITY_REGION);
});
