const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const ts = createRequire(path.resolve(__dirname, "../../../package.json"))("typescript");

function load(rel, mocks = {}) {
  const src = fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(js, { exports: mod.exports, module: mod, require: (n) => mocks[n] ?? {}, Math, Number });
  return mod.exports;
}

const geo = load("utils/geo.ts");
const { fallbackEtaMinutes } = load("utils/trackingEta.ts", { "@/utils/geo": geo });

// Roughly 1 km apart along Homs streets.
const restaurant = { latitude: 34.7300, longitude: 36.7100 };
const destination = { latitude: 34.7390, longitude: 36.7100 };
const courierNearCustomer = { latitude: 34.7385, longitude: 36.7102 };

test("while the courier is on the way to the restaurant the estimate includes pickup and the ride over", () => {
  // The bug in the screen recording: a courier standing next to the customer
  // was shown as "1 minute" away although the food was not collected yet.
  const eta = fallbackEtaMinutes({ status: "accepted", courier: courierNearCustomer, restaurant, destination });
  assert.ok(eta >= 15, `expected at least pickup + ride, got ${eta}`);
});

test("after pickup the estimate is the ride from the courier to the delivery address", () => {
  // Next to the door is still a few minutes: parking, the stairs, the handover.
  assert.equal(fallbackEtaMinutes({ status: "on_way", courier: courierNearCustomer, restaurant, destination }), 4);
  const fromRestaurant = fallbackEtaMinutes({ status: "picked_up", courier: restaurant, restaurant, destination });
  assert.ok(fromRestaurant >= 6 && fromRestaurant <= 9, `got ${fromRestaurant}`);
});

test("no delivery address means no guess", () => {
  assert.equal(fallbackEtaMinutes({ status: "accepted", courier: courierNearCustomer, restaurant, destination: null }), null);
  assert.equal(fallbackEtaMinutes({ status: "on_way", courier: courierNearCustomer, restaurant, destination: null }), null);
});

test("no estimate outside an active delivery", () => {
  for (const status of ["searching", "delivered", "cancelled", "scheduled"]) {
    assert.equal(fallbackEtaMinutes({ status, courier: courierNearCustomer, restaurant, destination }), null);
  }
});
