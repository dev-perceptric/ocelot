import { test } from "node:test";
import assert from "node:assert/strict";
import { readSnapshot } from "../src/lib/snapshot.ts";

test("a full snapshot reads into plain fields", () => {
  const s = readSnapshot({
    name: "Mai Nguyen", email: "mai@mail.test", phone: "+84 90 555 1234", headline: "Growth marketer", city: "Hanoi", country_code: "VN",
    years_experience: 5, languages: ["en", "vi"], links: [{ kind: "linkedin", url: "https://linkedin.com/in/mai" }, { kind: "website", url: "javascript:alert(1)" }],
    salary_hope: { min: 2000, currency: "USD", period: "month" }, answers: [{ prompt: "Why us?", answer: "Fit" }], note: " Hi ", job_title: "SDR",
  });
  assert.equal(s.name, "Mai Nguyen");
  assert.equal(s.place, "Hanoi, Vietnam");
  assert.equal(s.experience, "5 years of experience");
  assert.deepEqual(s.languages, ["English", "Vietnamese"]);
  assert.deepEqual(s.links, [{ label: "LinkedIn", url: "https://linkedin.com/in/mai" }]);
  assert.equal(s.salary, "From USD 2,000 per month");
  assert.deepEqual(s.answers, [{ prompt: "Why us?", answer: "Fit" }]);
  assert.equal(s.note, "Hi");
});
test("deleted and broken snapshots never throw", () => {
  assert.equal(readSnapshot({ deleted: true }).name, "Deleted account");
  const s = readSnapshot("nonsense");
  assert.equal(s.name, "Candidate");
  assert.deepEqual(s.answers, []);
  assert.equal(readSnapshot({ years_experience: 1 }).experience, "1 year of experience");
});
