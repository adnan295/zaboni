const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Pull just the two pure helpers out of the card file (it also holds React components).
const src = fs.readFileSync(path.join(__dirname, "../components/HorizontalRestaurantCard.tsx"), "utf8");
const pick = (name) => src.slice(src.indexOf(`export function ${name}`), src.indexOf("\n}\n", src.indexOf(`export function ${name}`)) + 2);
const js = ts.transpileModule(pick("minutesRange") + pick("minutesRangeText") + pick("formatRating"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const m = { exports: {} };
new Function("module", "exports", js)(m, m.exports);
const { minutesRange, minutesRangeText, formatRating } = m.exports;

test("the minutes word is written once, whatever the server sent", () => {
  for (const v of ["30-45", "30-45 دقيقة", "30-45 د", "30-45 د.", "30-45 min", " 30-45  دقيقة "]) {
    assert.equal(minutesRange(v), "30-45", JSON.stringify(v));
  }
  assert.equal(minutesRange(null), "");
});

test("ratings always show one decimal, and new places say so instead of 0", () => {
  assert.equal(formatRating(4), "4.0");
  assert.equal(formatRating(3.6), "3.6");
  assert.equal(formatRating(0), "جديد");
  assert.equal(formatRating(null), "جديد");
});

test("the range is wrapped so Arabic text cannot flip it", () => {
  assert.equal(minutesRangeText("30-45 دقيقة"), "\u206630-45\u2069");
});
