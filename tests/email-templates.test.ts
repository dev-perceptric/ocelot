import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// Self-hosted Supabase Auth loads the sign-in emails from the app (public/email-templates, set in
// deploy/sb-ocelot/docker-compose.yml). They must stay the same as the copies the local Supabase uses (supabase/templates).
const src = new URL("../supabase/templates/", import.meta.url);
const pub = new URL("../public/email-templates/", import.meta.url);

test("served email templates match supabase/templates", () => {
  const names = readdirSync(src).filter((f) => f.endsWith(".html")).sort();
  assert.deepEqual(readdirSync(pub).filter((f) => f.endsWith(".html")).sort(), names);
  for (const n of names) assert.equal(readFileSync(new URL(n, pub), "utf8"), readFileSync(new URL(n, src), "utf8"), n);
});

test("the Supabase stack points at every served template", () => {
  const override = readFileSync(new URL("../deploy/sb-ocelot/docker-compose.yml", import.meta.url), "utf8");
  for (const n of readdirSync(pub).filter((f) => f.endsWith(".html"))) assert.ok(override.includes(`/email-templates/${n}`), n);
});
