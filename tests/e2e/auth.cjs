// End-to-end on a real local Supabase: Log in and Sign up in the header, sign up with a password (and the emailed
// code), log in with a password, a wrong password, and Forgot password through to a new password.
// Run the same way as tests/e2e/team.cjs (see "End-to-end tests" in docs/setup.md).
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const APP = "http://localhost:3100", MAIL = "http://127.0.0.1:54324";
const sql = (q) => execSync(`psql postgres://postgres:postgres@127.0.0.1:54322/postgres -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (cond, what) => { console.log(`${cond ? "ok  " : "FAIL"} ${what}`); if (!cond) process.exitCode = 1; };

async function mail(email, after) {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent("to:" + email)}`)).json();
    const m = (list.messages ?? []).find((x) => new Date(x.Created) > after);
    if (m) return (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json();
    await sleep(500);
  }
  throw new Error("no email for " + email);
}

const EMAIL = "pia@pass.test", PASSWORD = "first-password-1", NEW_PASSWORD = "second-password-2";

(async () => {
  sql(`delete from auth.users where email = '${EMAIL}'`);
  const b = await chromium.launch();
  const errors = [];
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  p.on("pageerror", (e) => errors.push(e.message));

  await p.goto(`${APP}/`);
  await p.getByRole("link", { name: "Sign up", exact: true }).first().waitFor();
  ok(await p.locator("header").getByRole("link", { name: "Log in", exact: true }).isVisible(), "the header has Log in for visitors");
  ok(await p.locator("header").getByRole("link", { name: "Sign up", exact: true }).isVisible(), "and Sign up");

  // Sign up with a password; the emailed code finishes it.
  await p.locator("header").getByRole("link", { name: "Sign up", exact: true }).click();
  await p.waitForURL(/\/signup/);
  await p.fill("#email", EMAIL);
  await p.fill("#password", "short");
  await p.getByRole("button", { name: "Create account" }).click();
  await p.waitForSelector("text=Use at least 8 characters.");
  ok(true, "a short password is refused on the page");
  await p.getByRole("button", { name: "Show password" }).click();
  ok(await p.getAttribute("#password", "type") === "text", "the eye shows the password");
  const at = new Date(Date.now() - 1000);
  await p.fill("#password", PASSWORD);
  await p.getByRole("button", { name: "Create account" }).click();
  await p.waitForSelector("#code");
  const code = ((await mail(EMAIL, at)).Text || "").match(/\b(\d{6})\b/)[1];
  await p.fill("#code", code);
  await p.getByRole("button", { name: "Create account" }).click();
  await p.waitForURL(/\/welcome/);
  ok(true, "the code from the email creates the account");
  await p.getByText("Find a job").click();
  await p.getByRole("button", { name: "Continue" }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/welcome"));
  await p.goto(`${APP}/`);
  await p.locator("header").getByRole("link", { name: "My search" }).waitFor();
  ok(!(await p.locator("header").getByRole("link", { name: "Log in", exact: true }).isVisible()), "signed in, the header shows My search instead");

  // Log out, then a wrong password and the right one.
  await p.request.post(`${APP}/auth/signout`);
  await p.context().clearCookies();
  await p.goto(`${APP}/login`);
  ok(await p.isVisible("text=Welcome back") && await p.isVisible("text=Create an account"), "Log in says welcome back and links to Sign up");
  await p.fill("#email", EMAIL);
  await p.fill("#password", "not-my-password");
  await p.getByRole("button", { name: "Log in", exact: true }).click();
  await p.waitForSelector("#login-error");
  ok((await p.textContent("#login-error")).includes("don't match"), "a wrong password says so");
  await p.fill("#password", PASSWORD);
  await p.getByRole("button", { name: "Log in", exact: true }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/login"));
  ok(true, "the right password logs in");

  // The same email can't sign up twice.
  await p.context().clearCookies();
  await p.goto(`${APP}/signup`);
  await p.fill("#email", EMAIL);
  await p.fill("#password", "another-password-3");
  await p.getByRole("button", { name: "Create account" }).click();
  await p.waitForSelector("text=already an account");
  ok(true, "signing up again with the same email points to Log in");

  // Forgot password: the email's link signs in on a page that sets a new password.
  await p.goto(`${APP}/login`);
  await p.getByRole("link", { name: "Forgot password?" }).click();
  await p.waitForURL(/forgot-password/);
  const at2 = new Date(Date.now() - 1000);
  await p.fill("#email", EMAIL);
  await p.getByRole("button", { name: "Email me a link" }).click();
  await p.waitForSelector("text=we sent it a link");
  const reset = await mail(EMAIL, at2);
  const link = (reset.HTML || reset.Text).match(/href="([^"]*verify[^"]*)"/)?.[1]?.replace(/&amp;/g, "&");
  ok(Boolean(link) && reset.Subject === "Set a new Ocelot password", "the reset email arrives with a link");
  await p.goto(link);
  await p.waitForURL(/reset-password/);
  await p.fill("#password", NEW_PASSWORD);
  await p.getByRole("button", { name: "Save password" }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/reset-password"));
  await p.context().clearCookies();
  await p.goto(`${APP}/login`);
  await p.fill("#email", EMAIL);
  await p.fill("#password", NEW_PASSWORD);
  await p.getByRole("button", { name: "Log in", exact: true }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/login"));
  ok(true, "the new password works");

  // The emailed code still works, from its own page.
  await p.context().clearCookies();
  await p.goto(`${APP}/login`);
  await p.getByRole("link", { name: "Email me a sign-in code instead" }).click();
  await p.waitForURL(/method=code/);
  ok(await p.isVisible("text=Log in with a code"), "Log in with a code is one click away");

  ok(errors.length === 0, `no page errors ${errors.join(" | ")}`);
  await b.close();
})().catch((e) => { console.log("CRASH", e.message); process.exitCode = 1; });
