const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../utils/addressGuard.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const m = { exports: {} };
new Function("module", "exports", js)(m, m.exports);
const { farFromAddress, metersBetween, distanceLabel } = m.exports;

const home = { latitude: 34.7300, longitude: 36.7100 };

test("next to home: no question", () => {
  assert.equal(farFromAddress({ latitude: 34.7310, longitude: 36.7105, accuracy: 20 }, home), null); // ~120 m
});

test("across town: asks, with the distance", () => {
  const d = farFromAddress({ latitude: 34.7570, longitude: 36.7100, accuracy: 15 }, home); // ~3 km north
  assert.ok(d > 2900 && d < 3100, String(d));
  assert.equal(distanceLabel(d), "3 كم");
});

test("a vague GPS fix or missing data never triggers it", () => {
  assert.equal(farFromAddress({ latitude: 34.7570, longitude: 36.7100, accuracy: 900 }, home), null);
  assert.equal(farFromAddress(null, home), null);
  assert.equal(farFromAddress({ latitude: 34.7570, longitude: 36.7100 }, null), null);
});

test("distance in words", () => {
  assert.equal(distanceLabel(620), "600 م");
  assert.equal(distanceLabel(1440), "1.4 كم");
  assert.equal(distanceLabel(12600), "13 كم");
  assert.ok(Math.abs(metersBetween(home, home)) < 1e-6);
});
