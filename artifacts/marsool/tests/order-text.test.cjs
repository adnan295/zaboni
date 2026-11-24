const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const ts = createRequire(path.resolve(__dirname, "../../../package.json"))("typescript");

const js = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "../utils/orderText.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(js, { exports: mod.exports, module: mod, RegExp, Number, String });
const { addItemToOrderText: add } = mod.exports;

test("tapping menu items builds the order; tapping again counts up", () => {
  let t = "";
  t = add(t, "شاورما دجاج");
  assert.equal(t, "شاورما دجاج");
  t = add(t, "كبة لبنية");
  t = add(t, "شاورما دجاج");
  assert.equal(t, "شاورما دجاج × 2\nكبة لبنية");
  t = add(t, "شاورما دجاج");
  assert.equal(t, "شاورما دجاج × 3\nكبة لبنية");
});

test("what the customer typed is kept, and names with symbols are matched literally", () => {
  let t = "بدون بصل لو سمحت\n";
  t = add(t, "بيتزا (وسط)");
  t = add(t, "بيتزا (وسط)");
  assert.equal(t, "بدون بصل لو سمحت\nبيتزا (وسط) × 2");
  assert.equal(add("شاورما دجاج دبل", "شاورما دجاج"), "شاورما دجاج دبل\nشاورما دجاج", "a longer name is a different item");
});
