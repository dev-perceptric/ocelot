import { test } from "node:test";
import assert from "node:assert/strict";
import { readJob } from "../src/lib/jobForm.ts";

const form = (pairs: [string, string][]) => new URLSearchParams(pairs);
const full: [string, string][] = [
  ["title", " Growth Marketer "], ["role", "growth"], ["seniority", "mid"], ["employment_type", "full_time"],
  ["workplace", "hybrid"], ["office_places", "ho-chi-minh-city"], ["eligible_countries", "VN"],
  ["salary_min", "1,500"], ["salary_max", "2500"], ["salary_currency", "USD"], ["salary_period", "month"],
  ["description", "Run campaigns."], ["apply_method", "ocelot"], ["questions", "Why this role?"], ["questions", ""],
];

test("a full job form reads cleanly", () => {
  const { data, errors, questions } = readJob(form(full));
  assert.deepEqual(errors, {});
  assert.equal(data?.title, "Growth Marketer");
  assert.equal(data?.category, "marketing", "the role decides the category");
  assert.equal(data?.salary_min, 1500);
  assert.deepEqual(questions, ["Why this role?"]);
});

test("a draft can be saved with only a title", () => {
  const { data, errors } = readJob(form([["title", "Draft"]]));
  assert.deepEqual(errors, {});
  assert.equal(data?.role, null);
  assert.equal(data?.apply_method, "ocelot");
});

test("remote jobs drop office cities", () => {
  const { data } = readJob(form([["title", "Remote"], ["workplace", "remote"], ["office_places", "hanoi"]]));
  assert.deepEqual(data?.office_places, []);
});

test("pay needs sense, a currency and a period", () => {
  assert.match(readJob(form([["title", "x"], ["salary_min", "3000"], ["salary_max", "2000"]])).errors.salary!, /can't be more/);
  assert.match(readJob(form([["title", "x"], ["salary_min", "3000"]])).errors.salary!, /currency/);
  assert.match(readJob(form([["title", "x"], ["salary_min", "3000"], ["salary_currency", "USD"]])).errors.salary!, /per hour/);
  assert.match(readJob(form([["title", "x"], ["salary_min", "lots"]])).errors.salary!, /numbers/);
  assert.equal(readJob(form([["title", "x"], ["salary_currency", "USD"]])).data?.salary_currency, null, "no pay, no currency");
});

test("outside applications need a real address", () => {
  assert.ok(readJob(form([["title", "x"], ["apply_method", "external"], ["apply_url", "nope"]])).errors.apply_url);
  assert.equal(readJob(form([["title", "x"], ["apply_method", "external"], ["apply_url", "acme.com/jobs/1"]])).data?.apply_url, "https://acme.com/jobs/1");
  assert.equal(readJob(form([["title", "x"], ["apply_method", "external"], ["apply_url", ""]])).data?.apply_url, null, "a draft can leave it blank");
});

test("bad values are named", () => {
  const { errors } = readJob(form([["title", ""], ["role", "wizard"], ["workplace", "moon"], ["eligible_countries", "XX"],
    ["questions", "a"], ["questions", "b"], ["questions", "c"], ["questions", "d"], ["questions", "e"], ["questions", "f"]]));
  assert.deepEqual(Object.keys(errors).sort(), ["eligible_countries", "questions", "role", "title", "workplace"]);
});
