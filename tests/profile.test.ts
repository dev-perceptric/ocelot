import { test } from "node:test";
import assert from "node:assert/strict";
import { readProfile } from "../src/lib/profile.ts";

const form = (pairs: [string, string][]) => new URLSearchParams(pairs);

test("a full profile reads cleanly", () => {
  const { data, errors } = readProfile(form([
    ["full_name", " Linh Tran "], ["headline", "Content marketer"], ["phone", "+84 90 123 4567"], ["city", "hanoi"],
    ["years_experience", "5"], ["work_countries", "VN"], ["work_countries", "SG"], ["languages", "en"], ["languages", "vi"],
    ["open_to", "remote"], ["salary_hope_min", "2,000"], ["salary_hope_currency", "USD"], ["salary_hope_period", "month"],
    ["linkedin", "linkedin.com/in/linh"], ["website", "linh.dev"], ["time_zone", "Asia/Bangkok"],
  ]));
  assert.deepEqual(errors, {});
  assert.equal(data?.full_name, "Linh Tran");
  assert.equal(data?.country_code, "VN");
  assert.equal(data?.salary_hope_min, 2000);
  assert.deepEqual(data?.work_countries, ["VN", "SG"]);
  assert.deepEqual(data?.links, [
    { kind: "linkedin", url: "https://linkedin.com/in/linh" },
    { kind: "website", url: "https://linh.dev/" },
  ]);
});

test("only a name is needed", () => {
  const { data, errors } = readProfile(form([["full_name", "Linh"]]));
  assert.deepEqual(errors, {});
  assert.equal(data?.time_zone, "America/New_York");
  assert.equal(data?.salary_hope_currency, null);
});

test("each bad field gets its own message", () => {
  const { data, errors } = readProfile(form([
    ["full_name", ""], ["city", "atlantis"], ["years_experience", "4.5"], ["work_countries", "XX"], ["open_to", "anywhere"],
    ["salary_hope_min", "2000"], ["linkedin", "facebook.com/linh"], ["time_zone", "Mars/Base"], ["phone", "call me"],
  ]));
  assert.equal(data, undefined);
  assert.deepEqual(Object.keys(errors).sort(), [
    "city", "full_name", "linkedin", "open_to", "phone", "salary_hope_currency", "time_zone", "work_countries", "years_experience",
  ]);
});
