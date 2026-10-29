import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanCompanyName, sameCompany } from "../src/lib/ats/names.ts";

test("page names become company names", () => {
  assert.equal(cleanCompanyName("HackerRank Careers"), "HackerRank");
  assert.equal(cleanCompanyName(" Acme - Jobs "), "Acme");
  assert.equal(cleanCompanyName("Wise Worksite Field Sales "), "Wise Worksite Field Sales");
  assert.equal(cleanCompanyName("Careers"), "Careers", "a name is never emptied");
  assert.equal(cleanCompanyName("Jobber"), "Jobber");
});

test("a board belongs to the company Ocelot looked for", () => {
  for (const [a, b] of [["HackerRank", "HackerRank Careers"], ["Hacker Rank", "HackerRank"], ["Scale", "Scale AI"], ["Grafana", "Grafana Labs"],
    ["Ōura", "OURA"], ["Toast", "Toast, Inc."], ["The Trade Desk", "Trade Desk"]]) assert.ok(sameCompany(a, b), `${a} / ${b}`);
  for (const [a, b] of [["Wise", "Wise Worksite Field Sales"], ["Meta", "Addis Ababa University"], ["Disney", "Sgt. Pepper's Lonely Hearts Club Band"],
    ["Personio", "FD Sandbox"], ["EasyPost", "Postalia Belgium NV"]]) assert.ok(!sameCompany(a, b), `${a} / ${b}`);
});
