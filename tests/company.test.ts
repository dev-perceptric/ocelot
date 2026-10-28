import { test } from "node:test";
import assert from "node:assert/strict";
import { logoPathOk, readCompany } from "../src/lib/company.ts";

const form = (pairs: [string, string][]) => new URLSearchParams(pairs);

test("a full company form reads cleanly", () => {
  const { data, errors } = readCompany(form([
    ["name", " Example Co "], ["slug", "Example-Co"], ["website", "www.example.com/"], ["about", "We make things."],
    ["size", "11-50"], ["industry", "Software"], ["office_places", "hanoi"], ["office_places", "singapore-city"],
  ]));
  assert.deepEqual(errors, {});
  assert.equal(data?.slug, "example-co");
  assert.equal(data?.website, "https://www.example.com");
  assert.deepEqual(data?.office_places, ["hanoi", "singapore-city"]);
});

test("bad fields get their own messages", () => {
  const { data, errors } = readCompany(form([["name", ""], ["slug", "no spaces!"], ["website", "not a site"], ["size", "huge"], ["office_places", "atlantis"]]));
  assert.equal(data, undefined);
  assert.deepEqual(Object.keys(errors).sort(), ["name", "office_places", "size", "slug", "website"]);
});

test("logo paths stay inside the company's folder", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  assert.ok(logoPathOk(id, `${id}/1730000000000.png`));
  assert.ok(!logoPathOk(id, `99999999-2222-3333-4444-555555555555/1.png`));
  assert.ok(!logoPathOk(id, `${id}/../x.png`));
  assert.ok(!logoPathOk(id, `${id}/1.exe`));
});
