const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib/tripRoute.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", "process", js)(m, m.exports, require, { env: {} });
const { tripRoute, parsePoints } = m.exports;

const pts = [[34.728, 36.705], [34.733, 36.718]];
const ok = (body) => async () => ({ ok: true, json: async () => body });

test("follows the roads OSRM returns, starting and ending on our pins", async () => {
  const r = await tripRoute(pts, { baseUrl: "http://osrm:5000", fetchImpl: ok({ code: "Ok", routes: [{ geometry: { coordinates: [[36.7051, 34.7281], [36.71, 34.73], [36.7179, 34.7329]] } }] }) });
  assert.equal(r.source, "roads");
  assert.deepEqual(r.coords[0], pts[0]);
  assert.deepEqual(r.coords[2], [34.73, 36.71]);
  assert.deepEqual(r.coords.at(-1), pts[1]);
});

test("no routing service, an error, or no way found: straight lines", async () => {
  assert.equal((await tripRoute(pts, { baseUrl: "" })).source, "straight");
  const far = [[34.5, 36.5], [34.6, 36.6]];
  assert.equal((await tripRoute(far, { baseUrl: "http://osrm:5000", fetchImpl: async () => { throw new Error("down"); } })).source, "straight");
  assert.equal((await tripRoute([[34.1, 36.1], [34.2, 36.2]], { baseUrl: "http://osrm:5000", fetchImpl: ok({ code: "NoRoute" }) })).source, "straight");
});

test("points must be 2 to 4 real coordinates", () => {
  assert.deepEqual(parsePoints("34.7,36.7;34.8,36.8"), [[34.7, 36.7], [34.8, 36.8]]);
  assert.equal(parsePoints("34.7,36.7"), null);
  assert.equal(parsePoints("a,b;c,d"), null);
  assert.equal(parsePoints("95,36;34,36"), null);
  assert.equal(parsePoints(undefined), null);
});
