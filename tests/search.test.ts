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

test("saved filters go in and come back the same, and stale values drop out", async () => {
  const { fromSaved, toSaved, readFilters } = await import("../src/lib/search.ts");
  const f = readFilters({ q: "seo, content", where: "remote,hybrid", country: "VN", level: "mid", pay: "1" });
  const saved = JSON.parse(JSON.stringify(toSaved(f)));
  assert.equal("q" in saved, false);
  assert.deepEqual(fromSaved("seo, content", saved), f);
  assert.deepEqual(fromSaved("", { where: ["moon"], country: "XX", level: "mid" }).where, []);
  assert.equal(fromSaved("", "nonsense").country, null);
});

test("posted, pay and sort read from the address and write back; the old company filter is ignored", () => {
  const f = readFilters({ company: "zscaler", posted: "7", min_pay: "100000", sort: "new" });
  assert.deepEqual([f.posted, f.minPay, f.sort], [7, 100000, "new"]);
  assert.equal(filtersQuery(f), "?posted=7&min_pay=100000&sort=new");
  assert.equal(activeCount(f), 2, "the order isn't a filter");
  const bad = readFilters({ posted: "2", min_pay: "99", sort: "random" });
  assert.deepEqual([bad.posted, bad.minPay, bad.sort], [null, null, "best"]);
});

test("saved searches keep the pay, and leave out posted and order", async () => {
  const { fromSaved, toSaved } = await import("../src/lib/search.ts");
  const f = readFilters({ min_pay: "150000", posted: "1", sort: "new" });
  const back = fromSaved("", JSON.parse(JSON.stringify(toSaved(f))));
  assert.deepEqual([back.minPay, back.posted, back.sort], [150000, null, "best"]);
});

test("a state or province: from the address, or typed as the whole search", () => {
  const f = readFilters({ region: "US-TX" });
  assert.equal(f.region, "US-TX");
  assert.equal(filtersQuery(f), "?region=US-TX");
  assert.equal(readFilters({ region: "US-ZZ" }).region, null);
  const typed = readFilters({ q: " ontario " });
  assert.deepEqual([typed.q, typed.region], ["", "CA-ON"]);
  assert.equal(readFilters({ q: "texas sales" }).region, null, "only a search that is just the name");
});
