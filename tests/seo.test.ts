import { test } from "node:test";
import assert from "node:assert/strict";
import { AREAS, parseSeoPath, PLACES, searchHref, seoHeading, seoPath } from "../src/lib/seo.ts";
import { readFilters } from "../src/lib/search.ts";

test("clean addresses read back to their search, and back again", () => {
  const cases: [string, Record<string, string>, string][] = [
    ["sales-jobs", { category: "sales" }, "Sales jobs"],
    ["sales-jobs-in-texas", { category: "sales", region: "US-TX" }, "Sales jobs in Texas"],
    ["remote-marketing-jobs", { category: "marketing", where: "remote" }, "Remote marketing jobs"],
    ["account-executive-jobs-in-new-york", { role: "account_executive", city: "new-york" }, "Account executive jobs in New York"],
    ["sales-jobs-in-new-york-state", { category: "sales", region: "US-NY" }, "Sales jobs in New York State"],
    ["customer-success-jobs-in-ontario", { category: "customer_success", region: "CA-ON" }, "Customer success jobs in Ontario"],
    ["jobs-in-canada", { country: "CA" }, "Jobs in Canada"],
    ["remote-seo-jobs", { role: "seo", where: "remote" }, "Remote SEO jobs"],
    ["remote-jobs", { where: "remote" }, "Remote jobs"],
  ];
  for (const [slug, params, heading] of cases) {
    const f = parseSeoPath(slug);
    assert.deepEqual(f, readFilters(params), slug);
    assert.equal(seoPath(f!), `/${slug}`, slug);
    assert.equal(seoHeading(f!), heading, slug);
  }
  for (const bad of ["jobs", "pizza-jobs", "sales-jobs-in-atlantis", "sales", "sales-jobs-in-", "about"]) assert.equal(parseSeoPath(bad), null, bad);
});

test("searches with other filters stay on Find jobs", () => {
  assert.equal(searchHref(readFilters({ category: "sales", region: "US-TX", level: "senior" })), "/jobs?region=US-TX&category=sales&level=senior");
  assert.equal(searchHref(readFilters({ q: "stripe", category: "sales" })), "/jobs?q=stripe&category=sales");
  assert.equal(searchHref(readFilters({ where: "remote", city: "austin" })), "/jobs?where=remote&city=austin");
  assert.equal(searchHref(readFilters({ country: "SG", category: "sales" })), "/jobs?country=SG&category=sales");
  assert.equal(searchHref(readFilters({})), "/jobs");
  assert.equal(searchHref(readFilters({ category: "sales", region: "US-TX" }), 3), "/sales-jobs-in-texas?page=3");
});

test("every area and place has its own address", () => {
  assert.equal(new Set(AREAS.map((a) => a.slug)).size, AREAS.length);
  assert.equal(new Set(PLACES.map((p) => p.slug)).size, PLACES.length);
  assert.equal(AREAS.length, 3 + 21);
  assert.ok(PLACES.length > 90);
});
