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

test("the square phone icon first, then drawn icons, then by size; no mask icons", () => {
  const html = `<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" sizes="32x32" href="/f32.png"><link rel="mask-icon" href="/mask.svg">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple.png"><link rel="icon" sizes="192x192" href="https://cdn.x.com/i192.png">`;
  assert.deepEqual(iconsFromHome(html, "https://stripe.com/"), ["https://stripe.com/apple.png", "https://stripe.com/favicon.svg", "https://cdn.x.com/i192.png", "https://stripe.com/f32.png"]);
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
  assert.equal(imageKind(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script>x</script></svg>")), null);
  assert.equal(imageKind(new TextEncoder().encode("<html>not found</html>")), null);
});

test("the logo a company uploaded to its job board, and never the board's own", async () => {
  const { logosFromBoardPage } = await import("../src/lib/ats/site.ts");
  const gh = `<meta property="og:image" content="https://recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/000/004/439/original/agoda.jpg?1"/><img src="https://recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/000/004/439/original/agoda.jpg?1" alt="Agoda Logo" class="logo"/>`;
  assert.deepEqual(logosFromBoardPage(gh, "https://job-boards.greenhouse.io/agoda"), ["https://recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/000/004/439/original/agoda.jpg?1"]);
  const lever = `<img alt="Emburse logo" src="https://lever-client-logos.s3.us-west-2.amazonaws.com/5a.png"><img alt="Lever logo" src="/img/lever-logo-refresh.svg" class="footer-logo">`;
  assert.deepEqual(logosFromBoardPage(lever, "https://jobs.lever.co/emburse"), ["https://lever-client-logos.s3.us-west-2.amazonaws.com/5a.png"]);
  const ashby = `{"logoWordmarkImageUrl":"https://app.ashbyhq.com/api/images/org-theme-wordmark/1.png","logoSquareImageUrl":"https://app.ashbyhq.com/api/images/org-theme-logo/2.png"}`;
  assert.deepEqual(logosFromBoardPage(ashby, "https://jobs.ashbyhq.com/jobber"), ["https://app.ashbyhq.com/api/images/org-theme-logo/2.png", "https://app.ashbyhq.com/api/images/org-theme-wordmark/1.png"]);
  assert.deepEqual(logosFromBoardPage(`<meta property="og:image" content="https://cdn.example.com/team-photo.jpg">`, "https://x.test"), [], "a share picture that isn't a logo is left out");
});

test("websites from job links, from the name, and guesses", async () => {
  const { siteFromLinks, siteInName, guessLabels } = await import("../src/lib/ats/site.ts");
  assert.deepEqual(siteFromLinks(["https://www.coinbase.com/careers/positions/1?gh_jid=1", "https://job-boards.greenhouse.io/x/jobs/2", "http://careers.coinbase.com/x", null]), ["https://coinbase.com"]);
  assert.equal(siteInName("Honeycomb.io"), "https://honeycomb.io");
  assert.equal(siteInName("Blockchain.com"), "https://blockchain.com");
  assert.equal(siteInName("Grafana Labs"), null);
  assert.deepEqual(guessLabels("Scale AI").slice(0, 2), ["scaleai", "scale"]);
  assert.deepEqual(guessLabels("Grafana Labs").slice(0, 2), ["grafanalabs", "grafana"]);
});

test("drawn logos are kept only when they're plain pictures", async () => {
  const { svgSafe, imageKind } = await import("../src/lib/ats/site.ts");
  const enc = (s: string) => new TextEncoder().encode(s);
  assert.ok(svgSafe(enc(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="a"/></defs><path fill="url(#a)" d="M0 0h10v10H0z"/><use href="#a"/></svg>`)));
  assert.equal(imageKind(enc(`<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>`))?.type, "image/svg+xml");
  for (const bad of [`<svg><script>alert(1)</script></svg>`, `<svg onload="alert(1)"></svg>`, `<svg><foreignObject><iframe/></foreignObject></svg>`,
    `<svg><image href="https://evil.test/x.png"/></svg>`, `<svg><a xlink:href="javascript:alert(1)"/></svg>`, `<html><svg></svg></html>`]) assert.equal(svgSafe(enc(bad)), false, bad);
});

test("an .ico file gives its largest PNG", async () => {
  const { pngFromIco } = await import("../src/lib/ats/site.ts");
  const png = (w: number) => { const b = new Uint8Array(30); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); b[19] = w; return b; };
  const small = png(32), big = png(0); // 256 is written as 0
  const head = new Uint8Array(6 + 32);
  head.set([0, 0, 1, 0, 2, 0]);
  const entry = (i: number, w: number, size: number, off: number) => { const e = 6 + i * 16; head[e] = w; head.set([size & 255, size >> 8, 0, 0], e + 8); head.set([off & 255, off >> 8, 0, 0], e + 12); };
  entry(0, 32, small.length, 38); entry(1, 0, big.length, 68);
  const ico = new Uint8Array([...head, ...small, ...big]);
  assert.deepEqual(pngFromIco(ico), big);
  assert.equal(pngFromIco(new Uint8Array([1, 2, 3, 4, 5, 6])), null);
});
