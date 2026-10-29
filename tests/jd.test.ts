import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDescription } from "../src/lib/jd.ts";

test("a cleaned job board description reads as headings, paragraphs and one list per section", () => {
  const text = "Zscaler protects customers.\n\nRole\n\nWe are looking for a manager.\n\nWhat you’ll do (Role Expectations)\n\n• Lead PR strategy\n\n• Mine data\n\n• Pitch stories\n\nWho You Are\n\n• You act like an owner.\n• You champion simplicity.";
  assert.deepEqual(parseDescription(text), [
    { type: "paragraph", lines: ["Zscaler protects customers."] },
    { type: "heading", text: "Role" },
    { type: "paragraph", lines: ["We are looking for a manager."] },
    { type: "heading", text: "What you’ll do (Role Expectations)" },
    { type: "list", ordered: false, items: ["Lead PR strategy", "Mine data", "Pitch stories"] },
    { type: "heading", text: "Who You Are" },
    { type: "list", ordered: false, items: ["You act like an owner.", "You champion simplicity."] },
  ]);
});

test("typed descriptions: dashes, numbers, a lead-in line with a colon, and a bullet on its own line", () => {
  assert.deepEqual(parseDescription("About the team. We sell.\nRequirements:\n- 3 years in sales\n- Fluent English\n\n1. Apply\n2) Interview\n\n•\nWords on the next line"), [
    { type: "paragraph", lines: ["About the team. We sell."] },
    { type: "heading", text: "Requirements" },
    { type: "list", ordered: false, items: ["3 years in sales", "Fluent English"] },
    { type: "list", ordered: true, items: ["Apply", "Interview"] },
    { type: "list", ordered: false, items: ["Words on the next line"] },
  ]);
});

test("ordinary lines stay text", () => {
  const blocks = parseDescription("Salary: $120,000 - $145,000\n\nWe offer great benefits.\n\n-5% fees\n\nJoin us");
  assert.deepEqual(blocks.map((b) => b.type), ["paragraph", "paragraph", "paragraph", "paragraph"], "lines with colons or dollar signs, a dash with no space, and the last line are not headings");
});
