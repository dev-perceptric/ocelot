import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import { HEROES, heroFor } from "../src/lib/heroes.ts";
import { CITIES } from "../src/lib/places.ts";
import { readFilters } from "../src/lib/search.ts";
import { CATEGORIES, ROLES } from "../src/lib/taxonomy.ts";

const dir = new URL("../public/heroes/", import.meta.url);

test("every page photo exists, is small, has alt text and a credit, and is keyed to a real area, role or city", () => {
  const keys = new Set([...CATEGORIES.map((c) => `c:${c.slug}`), ...ROLES.map((r) => `r:${r.slug}`), ...CITIES.map((c) => `city:${c.slug}`)]);
  for (const [key, h] of Object.entries(HEROES)) {
    assert.ok(keys.has(key), `${key} is not an area, role or city`);
    const file = new URL(h.file, dir);
    assert.ok(existsSync(file), `${h.file} is missing`);
    assert.ok(statSync(file).size < 150_000, `${h.file} is over 150 KB`);
    assert.ok(h.alt.length > 10 && h.credit && h.license && h.source.startsWith("https://"), key);
  }
});

test("no photo file sits unused", () => {
  const used = new Set(Object.values(HEROES).map((h) => h.file));
  for (const f of readdirSync(dir)) assert.ok(used.has(f), `${f} is not in HEROES`);
});

test("a role's photo comes first, then its area's, then its city's", () => {
  assert.equal(heroFor(readFilters({ role: "product_design", city: "toronto" }))?.file, "product-design.webp");
  assert.equal(heroFor(readFilters({ role: "ux_research" }))?.file, HEROES["r:ux_research"]?.file ?? "design.webp");
  assert.equal(heroFor(readFilters({ category: "engineering", city: "toronto" }))?.file, "engineering.webp");
  assert.equal(heroFor(readFilters({ city: "toronto" }))?.file, "toronto.webp");
  assert.equal(heroFor(readFilters({ where: "remote" })), null);
});
