import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PLACES } from "../src/lib/places.ts";
import { CURRENCIES, INDUSTRIES, ROLES } from "../src/lib/taxonomy.ts";

// The code's lists and the database's lists must match, or forms offer values the database refuses.
const dir = new URL("../supabase/migrations/", import.meta.url);
const sql = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => readFileSync(new URL(f, dir), "utf8")).join("\n");
const bySlug = <T extends { slug: string }>(a: T[]) => [...a].sort((x, y) => x.slug.localeCompare(y.slug));

test("places match the database", () => {
  const rows = [...sql.matchAll(/\('([a-z0-9-]+)', '(country|city)', '([^']+)', '([A-Z]{2})', \d+\)/g)]
    .map(([, slug, kind, name, country_code]) => ({ slug, kind, name, country_code }));
  assert.ok(rows.length > 70);
  assert.deepEqual(bySlug(PLACES), bySlug(rows));
});

test("every city's country is on the list", () => {
  const codes = new Set(PLACES.filter((p) => p.kind === "country").map((p) => p.country_code));
  for (const city of PLACES.filter((p) => p.kind === "city")) assert.ok(codes.has(city.country_code), city.slug);
});

test("roles match the database", () => {
  const rows = [...sql.matchAll(/\('([a-z0-9_]+)', '(marketing|sales|customer_success|engineering|design|other)', '([^']+)', \d+\)/g)]
    .map(([, slug, category, name]) => ({ slug, category, name }));
  assert.deepEqual(ROLES, rows);
});

test("currencies match the database", () => {
  // The latest definition of each currency check is the one in force.
  const latest = new Map<string, string[]>();
  for (const m of sql.matchAll(/(salary_currency|salary_hope_currency) in \(('[A-Z]{3}'(?:, '[A-Z]{3}')*)\)/g)) latest.set(m[1], m[2].replace(/'/g, "").split(", "));
  assert.equal(latest.size, 2);
  for (const list of latest.values()) assert.deepEqual(list, [...CURRENCIES]);
});

test("industries match the database, in the same order", () => {
  const block = sql.slice(sql.indexOf("insert into public.industries"));
  const rows = [...block.slice(0, block.indexOf(";")).matchAll(/\('([a-z_]+)', '([^']+)', (\d+)\)/g)]
    .sort((a, b) => Number(a[3]) - Number(b[3])).map(([, slug, name]) => ({ slug, name }));
  assert.equal(rows.length, 26);
  assert.deepEqual(INDUSTRIES, rows);
});

test("every company industry set by a migration is on the list", () => {
  const slugs = new Set(INDUSTRIES.map((i) => i.slug));
  const block = sql.slice(sql.indexOf("update public.orgs o set industry = v.industry"));
  const values = [...block.slice(0, block.indexOf(";")).matchAll(/\('[a-z0-9-]+', '([a-z_]+)'\)/g)].map((m) => m[1]);
  assert.ok(values.length > 2000);
  for (const v of values) assert.ok(slugs.has(v), v);
});

test("job areas match the database", async () => {
  const { CATEGORIES } = await import("../src/lib/taxonomy.ts");
  // The latest definition of the jobs category check is the one in force.
  const checks = [...sql.matchAll(/jobs_category_check check \(category in \(([^)]*)\)\)/g)];
  const latest = checks[checks.length - 1][1].replace(/'/g, "").split(", ");
  assert.deepEqual(latest, CATEGORIES.map((c) => c.slug));
});
