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
    // One extra filter on top of an area and a place.
    ["senior-account-executive-jobs-in-new-york", { role: "account_executive", city: "new-york", level: "senior" }, "Senior account executive jobs in New York"],
    ["entry-level-sales-jobs-in-canada", { category: "sales", country: "CA", level: "entry" }, "Entry level sales jobs in Canada"],
    ["remote-senior-sales-jobs", { category: "sales", where: "remote", level: "senior" }, "Remote senior sales jobs"],
    ["contract-marketing-jobs", { category: "marketing", type: "contract" }, "Contract marketing jobs"],
    ["part-time-customer-support-jobs", { role: "support", type: "part_time" }, "Part-time customer support jobs"],
    ["marketing-internships", { category: "marketing", type: "internship" }, "Marketing internships"],
    ["internships-in-toronto", { city: "toronto", type: "internship" }, "Internships in Toronto"],
    ["hybrid-marketing-jobs-in-chicago", { category: "marketing", city: "chicago", where: "hybrid" }, "Hybrid marketing jobs in Chicago"],
    ["on-site-sales-jobs-in-austin", { category: "sales", city: "austin", where: "on_site" }, "On-site sales jobs in Austin"],
    ["sales-jobs-paying-100k-in-texas", { category: "sales", region: "US-TX", min_pay: "100000" }, "Sales jobs paying $100k+ in Texas"],
    ["remote-jobs-paying-150k", { where: "remote", min_pay: "150000" }, "Remote jobs paying $150k+"],
    ["senior-jobs", { level: "senior" }, "Senior jobs"],
    // Engineering and design roles.
    ["frontend-developer-jobs", { role: "frontend" }, "Frontend developer jobs"],
    ["remote-senior-backend-engineer-jobs", { role: "backend", where: "remote", level: "senior" }, "Remote senior backend engineer jobs"],
    ["devops-engineer-jobs-in-texas", { role: "devops", region: "US-TX" }, "DevOps and SRE jobs in Texas"],
    ["remote-qa-engineer-jobs", { role: "qa", where: "remote" }, "Remote QA engineer jobs"],
    ["ux-researcher-jobs-in-new-york", { role: "ux_research", city: "new-york" }, "UX researcher jobs in New York"],
    ["product-designer-jobs-paying-150k", { role: "product_design", min_pay: "150000" }, "Product designer jobs paying $150k+"],
    ["contract-graphic-designer-jobs", { role: "brand_design", type: "contract" }, "Contract brand and graphic design jobs"],
    ["design-director-jobs-in-canada", { role: "design_lead", country: "CA" }, "Design leadership jobs in Canada"],
  ];
  for (const [slug, params, heading] of cases) {
    const f = parseSeoPath(slug);
    assert.deepEqual(f, readFilters(params), slug);
    assert.equal(seoPath(f!), `/${slug}`, slug);
    assert.equal(seoHeading(f!), heading, slug);
  }
  for (const bad of ["jobs", "pizza-jobs", "sales-jobs-in-atlantis", "sales", "sales-jobs-in-", "about",
    // Two extras, remote with hybrid, remote in a city, the extra in the wrong place, a level on a leadership role.
    "senior-marketing-internships", "senior-jobs-paying-100k", "remote-hybrid-sales-jobs", "remote-senior-sales-jobs-in-austin",
    "senior-remote-sales-jobs", "marketing-jobs-senior", "lead-sales-director-jobs", "mid-level-sales-jobs", "temporary-sales-jobs",
    "sales-jobs-paying-90k", "senior-engineering-manager-jobs", "lead-design-director-jobs"]) assert.equal(parseSeoPath(bad), null, bad);
});

test("searches with other filters stay on Find jobs", () => {
  assert.equal(searchHref(readFilters({ category: "sales", region: "US-TX", level: "senior" })), "/senior-sales-jobs-in-texas");
  assert.equal(searchHref(readFilters({ category: "sales", level: "senior", type: "contract" })), "/jobs?category=sales&level=senior&type=contract");
  assert.equal(searchHref(readFilters({ category: "sales", level: "senior,lead" })), "/jobs?category=sales&level=senior%2Clead");
  assert.equal(searchHref(readFilters({ category: "sales", min_pay: "75000" })), "/jobs?category=sales&min_pay=75000");
  assert.equal(searchHref(readFilters({ q: "stripe", category: "sales" })), "/jobs?q=stripe&category=sales");
  assert.equal(searchHref(readFilters({ where: "remote", city: "austin" })), "/jobs?where=remote&city=austin");
  assert.equal(searchHref(readFilters({ country: "SG", category: "sales" })), "/jobs?country=SG&category=sales");
  assert.equal(searchHref(readFilters({})), "/jobs");
  assert.equal(searchHref(readFilters({ category: "sales", region: "US-TX" }), 3), "/sales-jobs-in-texas?page=3");
});

test("every area and place has its own address", () => {
  assert.equal(new Set(AREAS.map((a) => a.slug)).size, AREAS.length);
  assert.equal(new Set(PLACES.map((p) => p.slug)).size, PLACES.length);
  assert.equal(AREAS.length, 13 + 21 + 13); // every job area but Other, the 21 marketing, sales and customer success roles, and 13 engineering and design roles
  assert.ok(PLACES.length > 90);
});
