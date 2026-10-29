import { test } from "node:test";
import assert from "node:assert/strict";
import { activeCount, filtersQuery, readFilters } from "../src/lib/search.ts";

test("filters read from the address and drop unknown values", () => {
  const f = readFilters({ q: " seo ", where: "remote,moon", country: "VN", city: "atlantis", role: "seo", category: "sales", level: ["mid", "boss"], type: "contract", pay: "1" });
  assert.equal(f.q, "seo");
  assert.deepEqual(f.where, ["remote"]);
  assert.equal(f.country, "VN");
  assert.equal(f.city, null);
  assert.equal(f.role, "seo");
  assert.equal(f.category, "marketing", "the role's category wins over a different one in the address");
  assert.deepEqual(f.level, ["mid"]);
  assert.deepEqual(f.type, ["contract"]);
  assert.equal(f.pay, true);
  assert.equal(activeCount(f), 6);
});

test("search text keeps its commas", () => {
  assert.equal(readFilters({ q: "sales, marketing" }).q, "sales, marketing");
});

test("filters write back to a short address", () => {
  const f = readFilters({ where: "remote,hybrid", country: "SG", category: "sales" });
  assert.equal(filtersQuery(f), "?where=remote%2Chybrid&country=SG&category=sales");
  assert.equal(filtersQuery(f, 3), "?where=remote%2Chybrid&country=SG&category=sales&page=3");
  assert.equal(filtersQuery(readFilters({})), "");
});
