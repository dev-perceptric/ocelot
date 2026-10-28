import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSalary, formatWhere, jobPostingJsonLd, postedAgo, slugify, type Job, type Org } from "../src/lib/jobs.ts";

const job: Job = {
  id: "j1", org_id: "o1", slug: "marketing-manager", title: "Marketing Manager", description: "<p>Lead campaigns.</p>",
  category: "marketing", seniority: "mid", employment_type: "full_time", workplace: "remote",
  office_locations: [], eligible_countries: ["VN", "SG"], time_zones: [],
  salary_min: 2000, salary_max: 3000, salary_currency: "USD", salary_period: "month",
  apply_method: "ocelot", apply_url: null, status: "published", featured_until: null,
  published_at: "2026-10-20T00:00:00Z", expires_at: "2026-11-19T00:00:00Z",
};
const org: Org = {
  id: "o1", name: "Example Co", slug: "example-co", website: "https://example.com", logo_url: null, about: null,
  locations: [], email_verified_domain: null, business_verified_at: null,
};

test("salary reads like the brand example", () => {
  assert.equal(formatSalary(job), "USD 2,000-3,000 / month");
  assert.equal(formatSalary({ ...job, salary_max: null }), "From USD 2,000 / month");
  assert.equal(formatSalary({ ...job, salary_min: null }), "Up to USD 3,000 / month");
  assert.equal(formatSalary({ ...job, salary_min: null, salary_max: null }), "");
});

test("remote jobs name who can be hired", () => {
  assert.equal(formatWhere(job), "Remote (Vietnam, Singapore)");
  assert.equal(formatWhere({ ...job, workplace: "hybrid", office_locations: ["Ho Chi Minh City"] }), "Hybrid, Ho Chi Minh City");
});

test("slugs drop Vietnamese marks", () => {
  assert.equal(slugify("Chuyên viên Marketing – Đà Nẵng"), "chuyen-vien-marketing-da-nang");
  assert.equal(slugify("  Sales!! Lead "), "sales-lead");
});

test("JobPosting data matches the listing", () => {
  const d = jobPostingJsonLd(job, org, "https://joinocelot.com");
  assert.equal(d.jobLocationType, "TELECOMMUTE");
  assert.deepEqual(d.applicantLocationRequirements, [
    { "@type": "Country", name: "Vietnam" },
    { "@type": "Country", name: "Singapore" },
  ]);
  assert.equal(d.validThrough, job.expires_at);
  assert.equal(d.employmentType, "FULL_TIME");
  assert.equal((d.baseSalary as { currency: string }).currency, "USD");
  assert.equal(d.url, "https://joinocelot.com/jobs/marketing-manager");
});

test("posted dates", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  assert.equal(postedAgo("2026-10-28T01:00:00Z", now), "Today");
  assert.equal(postedAgo("2026-10-25T12:00:00Z", now), "3 days ago");
  assert.equal(postedAgo("2026-10-07T12:00:00Z", now), "3 weeks ago");
});
