const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");

function load(mocks) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib/deliveryEstimates.ts"), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const c = { exports: {}, require: (id) => { if (!(id in mocks)) throw new Error("Unmocked import " + id); return mocks[id]; }, Date, Math, Number, String, Promise };
  vm.runInNewContext(js, c);
  return c.exports;
}

test("learned times: per-restaurant pickup and range, pace per km, outliers ignored", async () => {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE restaurants (id TEXT PRIMARY KEY, lat REAL, lon REAL);
    CREATE TABLE orders (id TEXT PRIMARY KEY, restaurant_id TEXT, status TEXT, destination_lat DOUBLE PRECISION, destination_lon DOUBLE PRECISION, created_at TIMESTAMPTZ);
    CREATE TABLE order_status_history (id TEXT PRIMARY KEY, order_id TEXT, status TEXT, note TEXT, created_at TIMESTAMPTZ);
    -- destination is ~2.0 km north of both restaurants (0.018 degrees of latitude)
    INSERT INTO restaurants VALUES ('fast', 34.73, 36.71), ('slow', 34.73, 36.71), ('new', 34.73, 36.71);
  `);
  const add = async (id, rest, wait, pickup, ride) => {
    await pg.query(`INSERT INTO orders VALUES ($1,$2,'delivered',34.748,36.71, NOW() - INTERVAL '5 hours')`, [id, rest]);
    await pg.query(`INSERT INTO order_status_history VALUES
      ($1 || 'a', $1, 'accepted',  NULL, NOW() - INTERVAL '5 hours' + make_interval(mins => $2::int)),
      ($1 || 'p', $1, 'picked_up', NULL, NOW() - INTERVAL '5 hours' + make_interval(mins => $2::int + $3::int)),
      ($1 || 'd', $1, 'delivered', NULL, NOW() - INTERVAL '5 hours' + make_interval(mins => $2::int + $3::int + $4::int))`, [id, wait, pickup, ride]);
  };
  for (let i = 0; i < 6; i++) { await add("f" + i, "fast", 2, 6, 8); await add("s" + i, "slow", 2, 30, 8); }
  await add("n1", "new", 2, 10, 8);          // one order: not enough to judge this restaurant
  await add("x1", "fast", 2, 6, 900);        // forgot to press delivered for 15 hours

  const lib = load({ "@workspace/db": { pool: { query: (sql, args) => pg.query(sql, args) } } });
  const l = await lib.loadLearnedTimes();

  assert.equal(Math.round(l.wait), 2);
  assert.equal(Math.round(l.minutesPerKm), 4, "8 minutes over ~2 km; the 15-hour ride is ignored");
  assert.equal(Math.round(l.byRestaurantId.fast.pickup), 6);
  assert.equal(Math.round(l.byRestaurantId.slow.pickup), 30);
  assert.equal(l.byRestaurantId.new, undefined, "under 5 orders: keep the dashboard text");

  assert.equal(lib.restaurantDeliveryRange("fast", l), "15-20", "2 + 6 + 8 = 16 minutes door to door");
  assert.equal(lib.restaurantDeliveryRange("slow", l), "40-45", "2 + 30 + 8 = 40");
  assert.equal(lib.restaurantDeliveryRange("new", l), null);

  // A new order 2 km away: the slow kitchen is quoted honestly.
  assert.equal(lib.estimateOrderMinutes(2, "fast", l), 20);
  assert.equal(lib.estimateOrderMinutes(2, "slow", l), 40);
  await pg.close();
});

test("estimates fall back to the distance formula with no history, and live ETA follows the courier", () => {
  const lib = load({ "@workspace/db": { pool: {} } });
  assert.equal(lib.estimateOrderMinutes(2, "r1", lib.EMPTY_LEARNED), 23, "old formula: 15 + 4 per km");
  assert.equal(lib.restaurantDeliveryRange("r1", lib.EMPTY_LEARNED), null);

  const l = { wait: 3, pickup: 10, minutesPerKm: 4, sample: 50, byRestaurantId: { r1: { pickup: 20, totalLow: 30, totalHigh: 40, sample: 9 } } };
  const now = new Date("2026-11-12T12:00:00Z");
  const restaurant = { lat: 34.73, lon: 36.71 }, destination = { lat: 34.748, lon: 36.71 }; // ~2 km
  const base = { restaurant, destination, restaurantId: "r1", now };

  // Accepted 5 minutes ago: 15 of the usual 20 pickup minutes left + an 8-minute ride.
  assert.equal(lib.liveEtaMinutes({ ...base, status: "accepted", statusSince: new Date(now - 5 * 60000), courier: restaurant, courierFresh: true }, l), 23);
  // Pickup already overdue: never promises less than the ride plus a couple of minutes.
  assert.equal(lib.liveEtaMinutes({ ...base, status: "accepted", statusSince: new Date(now - 60 * 60000), courier: restaurant, courierFresh: true }, l), 10);
  // On the way, courier 1 km out.
  assert.equal(lib.liveEtaMinutes({ ...base, status: "on_way", statusSince: new Date(now - 4 * 60000), courier: { lat: 34.739, lon: 36.71 }, courierFresh: true }, l), 4);
  // Courier's phone went quiet: count down from the restaurant instead of freezing on the old dot.
  assert.equal(lib.liveEtaMinutes({ ...base, status: "on_way", statusSince: new Date(now - 3 * 60000), courier: { lat: 34.73, lon: 36.71 }, courierFresh: false }, l), 5);
  assert.equal(lib.liveEtaMinutes({ ...base, status: "delivered", statusSince: now, courier: restaurant, courierFresh: true }, l), null);
  assert.equal(lib.liveEtaMinutes({ ...base, destination: null, status: "on_way", statusSince: now, courier: restaurant, courierFresh: true }, l), null);
});
