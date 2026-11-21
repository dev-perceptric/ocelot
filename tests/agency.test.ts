import { test } from "node:test";
import assert from "node:assert/strict";
import { agencyLogoPathOk, companySlugFrom, readAgency } from "../src/lib/agency.ts";

const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });

test("the agency form cleans the website and checks the address", () => {
  const ok = readAgency(form({ name: " Hire Co ", slug: "Hire-Co", website: "hireco.com/", about: "" }));
  assert.deepEqual(ok.data, { name: "Hire Co", slug: "hire-co", website: "https://hireco.com", about: null });
  const bad = readAgency(form({ name: "", slug: "hire co", website: "nope" }));
  assert.ok(bad.errors.name && bad.errors.slug && bad.errors.website);
  assert.equal(bad.data, undefined);
});

test("an agency logo must sit in the agency's own folder", () => {
  assert.ok(agencyLogoPathOk("a1", "agencies/a1/1700000000.png"));
  assert.ok(!agencyLogoPathOk("a1", "agencies/a2/1700000000.png"));
  assert.ok(!agencyLogoPathOk("a1", "a1/1700000000.png"));
  assert.ok(!agencyLogoPathOk("a1", "agencies/a1/../x.png"));
});

test("a pasted company page address becomes its slug", () => {
  assert.equal(companySlugFrom("https://joinocelot.com/companies/acme-co/"), "acme-co");
  assert.equal(companySlugFrom("joinocelot.com/companies/acme?x=1"), "acme");
  assert.equal(companySlugFrom(" Acme "), "acme");
  assert.equal(companySlugFrom("not a slug!"), null);
});
