import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

// A loading.tsx makes Next.js send "200 OK" before the page runs, so a page that then calls notFound() answers 200
// with a "not found" message: a soft 404, which search engines count against the site. So no loading.tsx may sit
// above pages that can be missing: job pages, role and place pages, company pages. Find jobs' own loading screen
// lives in the (list) group, beside job pages rather than above them.
const root = new URL("../src/app/", import.meta.url);
const banned = [
  "loading.tsx", "(site)/loading.tsx", "(site)/jobs/loading.tsx", "(site)/jobs/[slug]/loading.tsx", "(site)/[seo]/loading.tsx",
  "(site)/companies/loading.tsx", "(site)/companies/[slug]/loading.tsx", "(site)/companies/[slug]/[area]/loading.tsx",
];

test("no loading screen above pages that can be missing", () => {
  for (const f of banned) assert.equal(existsSync(new URL(f, root)), false, `${f} would turn 404s into 200s`);
  assert.ok(existsSync(new URL("(site)/jobs/(list)/loading.tsx", root)), "Find jobs keeps its loading screen in (list)");
});
