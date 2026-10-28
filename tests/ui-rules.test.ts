import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// House rules from CLAUDE.md, checked on every file in src/. A failure names the file and the line.
const root = new URL("..", import.meta.url).pathname;
const files: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|css)$/.test(name)) files.push(p);
  }
};
walk(join(root, "src"));

const ALLOWED_HEX = ["src/app/globals.css", "src/lib/database.types.ts"];

function find(pattern: RegExp, skip: string[] = []) {
  const hits: string[] = [];
  for (const f of files) {
    const rel = relative(root, f);
    if (skip.includes(rel)) continue;
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      const code = line.trim();
      if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) return;
      if (pattern.test(line) && !line.includes("ui-rules: allow")) hits.push(`${rel}:${i + 1}  ${line.trim()}`);
    });
  }
  return hits;
}

test("colors come from tokens, never a raw hex", () => {
  assert.deepEqual(find(/#[0-9a-fA-F]{3,8}\b(?![\w-])/, ALLOWED_HEX), []);
});

test("no browser dropdowns", () => {
  assert.deepEqual(find(/<select[\s>]/), []);
});

test("no browser pop-ups", () => {
  assert.deepEqual(find(/(^|[^.\w])(alert|confirm|prompt)\(|window\.(alert|confirm|prompt)\b/), []);
});

test("no spinning loaders", () => {
  assert.deepEqual(find(/animate-spin|Loader2|"Loading…"|>Loading\.\.\.</), []);
});

test("tags always carry a text label", () => {
  assert.deepEqual(find(/<Tag[^>]*\/>/), []);
});

test("icon-only buttons go through IconButton or carry a label", () => {
  const hits: string[] = [];
  for (const f of files.filter((p) => p.endsWith(".tsx"))) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/<button\b[^>]*>\s*<[A-Z]\w*[^>]*\/>\s*<\/button>/g)) {
      if (!/aria-label=/.test(m[0])) hits.push(`${relative(root, f)}  ${m[0].slice(0, 80)}`);
    }
  }
  assert.deepEqual(hits, []);
});
