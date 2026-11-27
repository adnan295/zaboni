const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const load = (file, requireImpl = require) => {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", "process", js)(m, m.exports, requireImpl, { env: {} });
  return m.exports;
};

const { roadKmManyTo, roadKm, plausibleRoadKm, clearRoadCache } = load("roadDistance.ts");
const zones = load("deliveryZones.ts", (id) => (id === "@workspace/db" ? { db: {}, deliveryZonesTable: {} } : id === "drizzle-orm" ? { eq() {}, asc() {} } : require(id)));

const customer = { lat: 34.7296, lon: 36.7065 };
const rA = { lat: 34.7310, lon: 36.7000 };
const rB = { lat: 34.7200, lon: 36.7150 };
const table = (rows) => async (url) => ({ ok: true, json: async () => ({ code: "Ok", distances: rows, _url: url }) });

beforeEach(() => clearRoadCache());

test("asks OSRM once for the whole list, measured from each restaurant to the customer", async () => {
  let calls = 0, seen = "";
  const km = await roadKmManyTo([rA, rB], customer, {
    baseUrl: "http://osrm:5000",
    fetchImpl: async (url) => { calls++; seen = url; return table([[900], [1800]])(url); },
  });
  assert.deepEqual(km, [0.9, 1.8]);
  assert.equal(calls, 1);
  assert.match(seen, /^http:\/\/osrm:5000\/table\/v1\/driving\/36\.7065,34\.7296;36\.7,34\.731;36\.715,34\.72\?sources=1;2&destinations=0&annotations=distance$/);
  // Same pair again (the restaurant page, then checkout): from the cache, same number.
  assert.equal(await roadKm(rA, customer, { baseUrl: "http://osrm:5000", fetchImpl: async () => { throw new Error("no second call"); } }), 0.9);
});

test("no OSRM, an error, a timeout-like failure or no route: null, so the old estimate is used", async () => {
  assert.deepEqual(await roadKmManyTo([rA], customer, { baseUrl: "" }), [null]);
  assert.deepEqual(await roadKmManyTo([rA], customer, { baseUrl: "http://osrm:5000", fetchImpl: async () => { throw new Error("down"); } }), [null]);
  assert.deepEqual(await roadKmManyTo([rA], customer, { baseUrl: "http://osrm:5000", fetchImpl: async () => ({ ok: true, json: async () => ({ code: "NoRoute" }) }) }), [null]);
  assert.deepEqual(await roadKmManyTo([rA, rB], customer, { baseUrl: "http://osrm:5000", fetchImpl: table([[null], [1500]]) }), [null, 1.5]);
});

test("a road shorter than the straight line, or wildly longer, is not trusted", () => {
  assert.equal(plausibleRoadKm(1.2, 1.0), true);
  assert.equal(plausibleRoadKm(2.5, 0.94), true); // across a river: real
  assert.equal(plausibleRoadKm(0.5, 1.0), false);
  assert.equal(plausibleRoadKm(12, 1.0), false);
  assert.equal(plausibleRoadKm(NaN, 1.0), false);
});

test("the fee is priced on road km when known, else straight line × 1.35", () => {
  assert.equal(zones.pricedKm(1, 1.9), 1.9);
  assert.equal(zones.pricedKm(1, null), 1.35);
  assert.equal(zones.pricedKm(2), 2 * zones.ROAD_DISTANCE_FACTOR);
});
