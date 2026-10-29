import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanContacts, positionBetween, readCard } from "../src/lib/tracker.ts";

const form = (pairs: [string, string][]) => new URLSearchParams(pairs);

test("a card from anywhere reads cleanly", () => {
  const { data, errors } = readCard(form([["title", " Brand Lead "], ["company", "Elsewhere"], ["url", "elsewhere.com/jobs/1"], ["stage", "applied"], ["notes", "Referral from Minh"]]));
  assert.deepEqual(errors, {});
  assert.equal(data?.title, "Brand Lead");
  assert.equal(data?.url, "https://elsewhere.com/jobs/1");
  assert.equal(data?.stage, "applied");
});

test("only a title is needed; the stage defaults to Saved", () => {
  const { data } = readCard(form([["title", "Something"]]));
  assert.equal(data?.stage, "saved");
  assert.equal(data?.url, null);
});

test("bad values are named", () => {
  const { errors } = readCard(form([["title", ""], ["url", "not a link"], ["stage", "hired"]]));
  assert.deepEqual(Object.keys(errors).sort(), ["stage", "title", "url"]);
});

test("contacts drop blank rows and stay short", () => {
  const c = cleanContacts([{ name: " Minh ", email: "minh@x.test" }, { name: "", email: "" }, { phone: "0901234567" }, "junk"]);
  assert.deepEqual(c.map((x) => x.name || x.phone), ["Minh", "0901234567"]);
  assert.equal(cleanContacts(Array.from({ length: 30 }, (_, i) => ({ name: `P${i}` }))).length, 20);
  assert.deepEqual(cleanContacts("nope"), []);
});

test("dropped cards land between their neighbours", () => {
  assert.equal(positionBetween(null, null), 1000);
  assert.equal(positionBetween(1000, 2000), 1500);
  assert.equal(positionBetween(null, 1000), 0);
  assert.equal(positionBetween(3000, null), 4000);
});
