const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../utils/syrianDate.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const m = { exports: {} };
new Function("module", "exports", js)(m, m.exports);
const { syrianDay, syrianTime, syrianDateTime } = m.exports;

const now = new Date(2026, 10, 26, 12, 0); // 26 Nov 2026, noon local

test("months by their Syrian names, year only when it is another year", () => {
  assert.equal(syrianDay(new Date(2026, 10, 24), now), "24 تشرين التاني");
  assert.equal(syrianDay(new Date(2026, 0, 3), now), "3 كانون التاني");
  assert.equal(syrianDay(new Date(2025, 11, 31), now), "31 كانون الأول 2025");
  assert.equal(syrianDay("not a date", now), "");
});

test("12-hour time with ص / م", () => {
  assert.equal(syrianTime(new Date(2026, 10, 24, 20, 24)), "8:24 م");
  assert.equal(syrianTime(new Date(2026, 10, 24, 0, 5)), "12:05 ص");
  assert.equal(syrianTime(new Date(2026, 10, 24, 12, 0)), "12:00 م");
});

test("today and yesterday by name", () => {
  assert.equal(syrianDateTime(new Date(2026, 10, 26, 9, 30), now), "اليوم · 9:30 ص");
  assert.equal(syrianDateTime(new Date(2026, 10, 25, 21, 0), now), "مبارح · 9:00 م");
  assert.equal(syrianDateTime(new Date(2026, 10, 24, 20, 24), now), "24 تشرين التاني · 8:24 م");
});
