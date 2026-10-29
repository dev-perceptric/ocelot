import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { iconsFromHome, imageKind, isAtsHost, looksLikeCompany, privateAddress, safeUrl, siteHost, websiteFromBoardPage } from "../src/lib/ats/site.ts";

test("only public https addresses are fetched", () => {
  assert.ok(safeUrl("https://stripe.com/x"));
  for (const bad of ["http://stripe.com", "https://localhost/x", "https://10.0.0.1/", "https://169.254.169.254/latest", "https://[::1]/", "https://db.internal/", "https://user:pw@stripe.com", "https://stripe.com:8443/", "javascript:alert(1)", "nonsense", null]) {
    assert.equal(safeUrl(bad), null, String(bad));
  }
});

test("website hosts and company names", () => {
  assert.equal(siteHost("careers.toasttab.com"), "toasttab.com");
  assert.equal(siteHost("www.stripe.com"), "stripe.com");
  assert.equal(siteHost("ramp.com"), "ramp.com");
  assert.ok(isAtsHost("jobs.lever.co") && isAtsHost("boards.greenhouse.io") && !isAtsHost("stripe.com"));
  assert.ok(looksLikeCompany("careers.toasttab.com", "Toast"));
  assert.ok(looksLikeCompany("www.palantir.com", "Palantir Technologies"));
  assert.ok(looksLikeCompany("ramp.com", "Ramp"));
  assert.ok(!looksLikeCompany("twitter.com", "Ramp"));
  assert.ok(!looksLikeCompany("glassdoor.com", "Toast"));
});

test("the website from real board pages", () => {
  const page = (f: string) => readFileSync(new URL(`./fixtures/ats/${f}`, import.meta.url), "utf8");
  assert.equal(websiteFromBoardPage(page("lever-page.html"), "Palantir"), "https://palantir.com");
  assert.equal(websiteFromBoardPage(page("ashby-page.html"), "Ramp"), "https://ramp.com");
  assert.equal(websiteFromBoardPage("<a href=\"https://twitter.com/ramp\">x</a>", "Ramp"), null);
});

test("the square phone icon first, no SVG", () => {
  const html = `<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" sizes="32x32" href="/f32.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple.png"><link rel="icon" sizes="192x192" href="https://cdn.x.com/i192.png">`;
  assert.deepEqual(iconsFromHome(html, "https://stripe.com/"), ["https://stripe.com/apple.png", "https://cdn.x.com/i192.png", "https://stripe.com/f32.png"]);
  assert.deepEqual(iconsFromHome("<html></html>", "https://x.com"), []);
});

test("names that point at private addresses are refused", () => {
  for (const ip of ["10.1.2.3", "127.0.0.1", "169.254.169.254", "172.20.0.1", "192.168.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) assert.ok(privateAddress(ip), ip);
  for (const ip of ["104.18.1.1", "172.32.0.1", "8.8.8.8", "2606:4700::1111"]) assert.ok(!privateAddress(ip), ip);
});

test("a logo's type comes from its bytes, and small icons are spotted", () => {
  const png = new Uint8Array(40);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  png.set([0, 0, 0, 180], 16);
  assert.deepEqual(imageKind(png), { type: "image/png", width: 180 });
  assert.deepEqual(imageKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), { type: "image/jpeg", width: null });
  assert.deepEqual(imageKind(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), { type: "image/webp", width: null });
  assert.equal(imageKind(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>")), null);
  assert.equal(imageKind(new TextEncoder().encode("<html>not found</html>")), null);
});
