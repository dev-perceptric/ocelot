// End-to-end on a real local Supabase: résumés: upload, file checks, download links, rename,
// picking one on a tracker card and delete. Run like tests/e2e/team.cjs (see "End-to-end tests" in docs/setup.md).
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const APP = "http://localhost:3100", MAIL = "http://127.0.0.1:54324";
const sql = (q) => execSync(`psql postgres://postgres:postgres@127.0.0.1:54322/postgres -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (cond, what) => { console.log(`${cond ? "ok  " : "FAIL"} ${what}`); if (!cond) process.exitCode = 1; };

async function code(email, after) {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent("to:" + email)}`)).json();
    const m = (list.messages ?? []).find((x) => new Date(x.Created) > after);
    if (m) {
      const full = await (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json();
      const c = (full.Text || full.HTML).match(/\b(\d{6})\b/);
      if (c) return c[1];
    }
    await sleep(500);
  }
  throw new Error("no code email for " + email);
}
async function login(page, email, intent) {
  await page.goto(`${APP}/login`);
  const at = new Date(Date.now() - 1000);
  await page.fill("#email", email);
  await page.click("button[type=submit]");
  await page.waitForSelector("#code");
  await page.fill("#code", await code(email, at));
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  if (page.url().includes("/welcome")) {
    await page.getByText(intent).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/welcome"));
  }
}

const PDF = { name: "Rosa CV 2026.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n") };
const DOCX = { name: "Rosa CV sales.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  buffer: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("....[Content_Types].xml....word/document.xml....")]) };
const FAKE = { name: "totally a cv.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ\x90\x00 this is a program") };

(async () => {
  const b = await chromium.launch();
  const errors = [];
  const p = await (await b.newContext()).newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await login(p, "rosa@mail.test", "Find a job");
  const uid = sql("select id from auth.users where email = 'rosa@mail.test'");
  const files = () => sql(`select count(*) from storage.objects where bucket_id = 'resumes' and name like '${uid}/%'`);
  const upload = async (file) => {
    await p.getByRole("button", { name: "Upload résumé" }).first().click();
    await p.locator("dialog[open] input[type=file]").setInputFiles(file);
  };

  await p.goto(`${APP}/app/resumes`);
  ok(await p.isVisible("text=Keep every version of your résumé"), "the first screen explains résumés");

  await upload(PDF);
  await p.waitForSelector("text=Résumé uploaded");
  ok(sql(`select name || '|' || mime_type from documents where user_id = '${uid}'`) === "Rosa CV 2026|application/pdf", "a PDF uploads and takes its file name");
  await p.waitForSelector("table >> text=Rosa CV 2026");
  ok(true, "the list shows it");

  await upload(DOCX);
  await p.waitForSelector("text=Résumé uploaded >> nth=-1");
  await sleep(500);
  ok(sql(`select count(*) from documents where user_id = '${uid}' and name = 'Rosa CV sales'`) === "1", "a Word file uploads");

  await upload(FAKE);
  await p.waitForSelector("text=That file isn't a real PDF or Word file");
  ok(sql(`select count(*) from documents where user_id = '${uid}'`) === "2", "a renamed file is refused");
  ok(files() === "2", "and removed from storage");
  await p.keyboard.press("Escape");

  await upload({ name: "big.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(6 * 1024 * 1024, 0x20) });
  ok(await p.locator("dialog[open]").getByText("Choose a file under 5 MB.").isVisible(), "big files are stopped in the browser");
  await p.locator("dialog[open] input[type=file]").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  ok(await p.locator("dialog[open]").getByText("Choose a PDF or Word file.").isVisible(), "so are other file types");
  await p.keyboard.press("Escape");

  // Downloads go through a short signed link, and only for the owner.
  const pdfId = sql(`select id from documents where user_id = '${uid}' and name = 'Rosa CV 2026'`);
  const r = await p.request.get(`${APP}/app/resumes/${pdfId}/download`, { maxRedirects: 0 });
  const to = r.headers()["location"] ?? "";
  ok(r.status() >= 300 && r.status() < 400 && /\/object\/sign\/resumes\//.test(to) && /token=/.test(to), "download sends a signed link");
  const body = await (await fetch(to)).text();
  ok(body.startsWith("%PDF"), "the signed link opens the file");
  const other = await (await b.newContext()).newPage();
  await login(other, "sam@mail.test", "Find a job");
  ok((await other.request.get(`${APP}/app/resumes/${pdfId}/download`, { maxRedirects: 0 })).status() === 404, "someone else can't open it");
  const pub = await fetch(`http://127.0.0.1:54321/storage/v1/object/public/resumes/${sql(`select storage_path from documents where id = '${pdfId}'`)}`);
  ok(pub.status >= 400, "there's no public address");

  // Rename.
  await p.getByRole("button", { name: "Actions for Rosa CV 2026" }).click();
  await p.getByRole("menuitem", { name: "Rename" }).click();
  await p.locator("dialog[open]").getByLabel("Name").fill("Rosa CV marketing");
  await p.locator("dialog[open]").getByRole("button", { name: "Save name" }).click();
  await p.waitForSelector("text=Name saved");
  ok(sql(`select name from documents where id = '${pdfId}'`) === "Rosa CV marketing", "a résumé can be renamed");

  // Pick it on a tracker card.
  const card = sql(`insert into tracker_items (user_id, title, company, stage) values ('${uid}', 'Marketing Lead', 'Acme Co', 'applied') returning id`).split("\n")[0];
  await p.goto(`${APP}/app/tracker/${card}`);
  await p.locator(`#resume-${card}`).click();
  await p.getByRole("option", { name: "Rosa CV marketing" }).click();
  await p.waitForSelector("text=Résumé saved");
  ok(sql(`select resume_id from tracker_items where id = '${card}'`) === pdfId, "a card shows which résumé was used");
  await p.goto(`${APP}/app/resumes`);
  ok(await p.isVisible("td:has-text('1 job')"), "the list shows where each résumé was used");

  // Delete.
  await p.getByRole("button", { name: "Actions for Rosa CV marketing" }).click();
  await p.getByRole("menuitem", { name: "Delete" }).click();
  await p.locator("dialog[open]").getByRole("button", { name: "Delete résumé" }).click();
  await p.waitForSelector("text=Résumé deleted");
  ok(sql(`select count(*) from documents where id = '${pdfId}'`) === "0", "a résumé can be deleted");
  ok(files() === "1", "its file goes too");
  ok(sql(`select resume_id is null from tracker_items where id = '${card}'`) === "t", "and the card shows no résumé");

  console.log("page errors:", errors);
  await b.close();
})().catch((e) => { console.error("CRASH", e.message); process.exit(1); });
