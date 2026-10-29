import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EMAIL_COLORS } from "../src/lib/email/colors.ts";
import { esc, layout, optionalFooter } from "../src/lib/email/layout.ts";
import { applicationSent, newApplicant, stageUpdate, STAGE_EMAIL, inviteAccepted, jobPublished, jobSentBack, teamInvite } from "../src/lib/email/templates.ts";
import { oneClickUrl, sign, signingKey, unsubscribeUrl, verify } from "../src/lib/email/unsubscribe.ts";

test("email colors match the brand tokens", () => {
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8").toLowerCase();
  for (const [name, hex] of Object.entries(EMAIL_COLORS)) assert.ok(css.includes(`--color-${name}: ${hex.toLowerCase()}`), name);
});

test("templates fill every value and escape what people typed", () => {
  const e = teamInvite({ company: "Acme <script>", inviter: "Ana", role: "admin", url: "https://joinocelot.com/invite/abc", expiresDays: 7 });
  assert.equal(e.pref, null);
  assert.match(e.subject, /Ana invited you to Acme <script> on Ocelot/);
  assert.ok(!e.html.includes("<script>"));
  assert.ok(e.html.includes("Acme &lt;script&gt;"));
  assert.ok(e.html.includes('href="https://joinocelot.com/invite/abc"'));
  assert.match(e.text, /Accept invite: https:\/\/joinocelot.com\/invite\/abc/);
  for (const m of [
    e,
    inviteAccepted({ company: "Acme", member: "Ben", teamUrl: "https://joinocelot.com/employer/team" }),
    jobPublished({ company: "Acme", title: "SDR", jobUrl: "https://joinocelot.com/jobs/sdr", manageUrl: "https://joinocelot.com/employer/jobs", until: "28 November" }),
    jobSentBack({ title: "SDR", note: "Add pay <please>", editUrl: "https://joinocelot.com/employer/jobs/1" }),
    applicationSent({ job: "SDR", company: "Acme", cardUrl: "https://joinocelot.com/app/tracker/1" }),
    newApplicant({ company: "Acme", job: "SDR", name: "Mai", url: "https://joinocelot.com/employer/applicants/1", siteUrl: "https://joinocelot.com" }),
    ...STAGE_EMAIL.map((stage) => stageUpdate({ company: "Acme", job: "SDR", stage, cardUrl: "https://joinocelot.com/app/tracker/1", siteUrl: "https://joinocelot.com" })),
  ]) {
    // {{unsubscribe}} is filled in when the email is queued (src/lib/email/send.ts).
    assert.ok(!/undefined|null|\{\{|\$\{/.test((m.html + m.text).replaceAll("{{unsubscribe}}", "")), "no empty or unfilled values");
  }
});

test("optional emails carry settings and unsubscribe links", () => {
  const { html, text } = layout({ title: "T", preview: "P", blocks: [{ p: "x" }], footer: optionalFooter("https://joinocelot.com") });
  assert.ok(html.includes('href="{{unsubscribe}}"') && text.includes("Unsubscribe: {{unsubscribe}}"));
  assert.ok(html.includes("https://joinocelot.com/app/settings"));
});

test("esc covers HTML specials", () => {
  assert.equal(esc(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});

test("unsubscribe links only work for the person and email kind they were made for", () => {
  const key = signingKey("server-secret");
  const u = "00000000-0000-0000-0000-00000000000a";
  const t = sign(key, u, "weekly_digest");
  assert.ok(verify(key, u, "weekly_digest", t));
  assert.ok(!verify(key, u, "job_alerts", t), "other email kind");
  assert.ok(!verify(key, "00000000-0000-0000-0000-00000000000b", "weekly_digest", t), "other person");
  assert.ok(!verify(signingKey("other-secret"), u, "weekly_digest", t), "other key");
  assert.ok(!verify(key, u, "weekly_digest", t.slice(0, -1) + "x"), "changed token");
  assert.ok(!verify(key, u, "everything", t), "unknown kind");
  assert.match(unsubscribeUrl("https://joinocelot.com", key, u, "weekly_digest"), /^https:\/\/joinocelot.com\/unsubscribe\?u=.+&p=weekly_digest&t=/);
  assert.match(oneClickUrl("https://joinocelot.com", key, u, "weekly_digest"), /^https:\/\/joinocelot.com\/api\/unsubscribe\?/);
});

test("applicant and stage emails can be turned off and carry the unsubscribe link", () => {
  const a = newApplicant({ company: "Acme", job: "SDR", name: "Mai <b>", url: "https://joinocelot.com/employer/applicants/1", siteUrl: "https://joinocelot.com" });
  assert.equal(a.pref, "new_applicants");
  assert.ok(a.html.includes("{{unsubscribe}}") && a.html.includes("Mai &lt;b&gt;"));
  for (const stage of STAGE_EMAIL) {
    const e = stageUpdate({ company: "Acme", job: "SDR", stage, cardUrl: "https://joinocelot.com/app/tracker/1", siteUrl: "https://joinocelot.com" });
    assert.equal(e.pref, "application_updates");
    assert.ok(e.html.includes("{{unsubscribe}}"));
  }
});
