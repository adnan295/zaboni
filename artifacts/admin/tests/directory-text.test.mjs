import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const js = ts.transpileModule(fs.readFileSync(new URL("../src/lib/directoryText.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} }; new Function("module", "exports", "require", js)(m, m.exports, () => ({}));
const { parseLocation, menuFromText, menuToText, parsePastedRows } = m.exports;
test("locations", () => {
  assert.deepEqual(parseLocation("34.7324, 36.7137"), { lat: 34.7324, lon: 36.7137 });
  assert.deepEqual(parseLocation("https://www.google.com/maps/place/x/@34.7301,36.7102,17z/data=!3d34.73015!4d36.71021"), { lat: 34.73015, lon: 36.71021 });
  assert.deepEqual(parseLocation("https://maps.google.com/?q=34.72,36.71"), { lat: 34.72, lon: 36.71 });
  assert.equal(parseLocation("https://maps.app.goo.gl/abc"), null);
  assert.equal(parseLocation("الحمرا"), null);
});
test("menu text round trip", () => {
  const menu = menuFromText("# مشاوي\nشيش طاووق\nكباب\n\n# مقبلات\nحمص\n");
  assert.deepEqual(menu, [{ title: "مشاوي", items: ["شيش طاووق", "كباب"] }, { title: "مقبلات", items: ["حمص"] }]);
  assert.deepEqual(menuFromText(menuToText(menu)), menu);
  assert.deepEqual(menuFromText("خبز\nلبنة"), [{ title: "", items: ["خبز", "لبنة"] }]);
});
test("rows pasted from Excel", () => {
  const rows = parsePastedRows("الاسم\tالنوع\tالرقم\tالحي\tالموقع\nلحمة أبو علي\tلحّام\t0944000000\tالحمرا\t34.73, 36.71\nبلا موقع\tبقالية\t\t\tالحمرا\n");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].place.nameAr, "لحمة أبو علي");
  assert.equal(rows[0].place.lat, 34.73);
  assert.equal(rows[1].error, "الموقع مو مفهوم");
});
