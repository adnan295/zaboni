const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../components/deliveryMapShared.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", js)(m, m.exports, () => ({}));
const { tripLegs } = m.exports;

const C = { latitude: 34.73, longitude: 36.71 };
const R = { latitude: 34.72, longitude: 36.70 };
const H = { latitude: 34.74, longitude: 36.72 };

test("going to the restaurant: courier → restaurant now, restaurant → home after", () => {
  assert.deepEqual(tripLegs("accepted", C, R, H), { done: [C, R], left: [R, H] });
});

test("carrying the order: restaurant → courier covered, courier → home left", () => {
  assert.deepEqual(tripLegs("on_way", C, R, H), { done: [R, C], left: [C, H] });
  assert.deepEqual(tripLegs("picked_up", C, R, H), { done: [R, C], left: [C, H] });
});

test("missing points drop only the stretch that needs them", () => {
  assert.deepEqual(tripLegs("accepted", null, R, H), { done: null, left: [R, H] }, "no GPS yet");
  assert.deepEqual(tripLegs("accepted", C, null, H), { done: null, left: [C, H] }, "errand: no restaurant pin");
  assert.deepEqual(tripLegs("on_way", null, R, H), { done: null, left: [R, H] });
  assert.deepEqual(tripLegs("delivered", C, R, H), { done: null, left: null });
});
