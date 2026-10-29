import { test } from "node:test";
import assert from "node:assert/strict";
import { DOCX, PDF, fileSize, isResumePath, resumeName, sniffResume } from "../src/lib/resumes.ts";

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? Array.from(p, (c) => c.charCodeAt(0)) : p)));
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const uid = "00000000-0000-0000-0000-00000000000d";

test("a PDF is known by its first bytes", () => {
  assert.equal(sniffResume(bytes("%PDF-1.7\n...")), PDF);
});
test("a Word file is a zip that holds word/document.xml", () => {
  assert.equal(sniffResume(bytes(ZIP, "....[Content_Types].xml....word/document.xml....")), DOCX);
});
test("other zips, renamed files and empty files are refused", () => {
  assert.equal(sniffResume(bytes(ZIP, "....[Content_Types].xml....xl/workbook.xml")), null);
  assert.equal(sniffResume(bytes("MZ\x90\x00 not a pdf")), null);
  assert.equal(sniffResume(bytes("<html>%PDF-")), null);
  assert.equal(sniffResume(new Uint8Array()), null);
});
test("only paths in your own folder with a random id", () => {
  assert.ok(isResumePath(`${uid}/0f8e4a52-6d2c-4e7b-9a1f-3c5d7e9b1a2c.pdf`, uid));
  assert.ok(isResumePath(`${uid}/0f8e4a52-6d2c-4e7b-9a1f-3c5d7e9b1a2c.docx`, uid));
  assert.ok(!isResumePath(`00000000-0000-0000-0000-00000000000c/0f8e4a52-6d2c-4e7b-9a1f-3c5d7e9b1a2c.pdf`, uid));
  assert.ok(!isResumePath(`${uid}/../x/0f8e4a52-6d2c-4e7b-9a1f-3c5d7e9b1a2c.pdf`, uid));
  assert.ok(!isResumePath(`${uid}/0f8e4a52-6d2c-4e7b-9a1f-3c5d7e9b1a2c.exe`, uid));
});
test("names come from the file name", () => {
  assert.equal(resumeName("Hoa Nguyen CV (2026).pdf"), "Hoa Nguyen CV (2026)");
  assert.equal(resumeName("cv.DOCX"), "cv");
  assert.equal(resumeName(".pdf"), "Résumé");
  assert.equal(resumeName("x".repeat(200) + ".pdf").length, 120);
});
test("sizes read in KB or MB", () => {
  assert.equal(fileSize(300 * 1024), "300 KB");
  assert.equal(fileSize(200), "1 KB");
  assert.equal(fileSize(2.5 * 1024 * 1024), "2.5 MB");
});
