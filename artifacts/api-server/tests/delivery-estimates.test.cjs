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

test("learned times: per-restaurant pickup and range, fixed + per-km ride, courier pace, practice orders ignored", async () => {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE restaurants (id TEXT PRIMARY KEY, lat REAL, lon REAL);
    CREATE TABLE orders (id TEXT PRIMARY KEY, restaurant_id TEXT, courier_id TEXT, status TEXT, destination_lat DOUBLE PRECISION, destination_lon DOUBLE PRECISION, created_at TIMESTAMPTZ);
    CREATE TABLE order_status_history (id TEXT PRIMARY KEY, order_id TEXT, status TEXT, note TEXT, created_at TIMESTAMPTZ);
    INSERT INTO restaurants VALUES ('fast', 34.73, 36.71), ('slow', 34.73, 36.71), ('new', 34.73, 36.71), ('other', 34.73, 36.71);
  `);
  // 0.009 degrees of latitude ≈ 1 km north of the restaurants.
  const add = async (id, rest, courier, km, wait, pickup, ride) => {
    await pg.query(`INSERT INTO orders VALUES ($1,$2,$3,'delivered',$4,36.71, NOW() - INTERVAL '5 hours')`, [id, rest, courier, 34.73 + 0.009 * km]);
    await pg.query(`INSERT INTO order_status_history VALUES
      ($1 || 'a', $1, 'accepted',  NULL, NOW() - INTERVAL '5 hours' + make_interval(mins => $2::int)),
      ($1 || 'p', $1, 'picked_up', NULL, NOW() - INTERVAL '5 hours' + make_interval(mins => $2::int + $3::int)),
      ($1 || 'd', $1, 'delivered', NULL, NOW() - INTERVAL '5 hours' + make_interval(mins => $2::int + $3::int + $4::int))`, [id, wait, pickup, ride]);
  };
  // Real Homs shape: 8 fixed minutes + 3 per km, whatever the distance.
  const kms = [1, 2, 3, 1, 2, 3];
  for (let i = 0; i < 6; i++) {
    await add("f" + i, "fast", "avg", kms[i], 2, 6, 8 + 3 * kms[i]);
    await add("s" + i, "slow", "avg", kms[i], 2, 30, 8 + 3 * kms[i]);
  }
  // One courier rides half as fast again on every trip.
  for (let i = 0; i < 6; i++) await add("o" + i, "other", "slowpoke", kms[i], 2, 15, Math.round(1.5 * (8 + 3 * kms[i])));
  await add("n1", "new", "avg", 2, 2, 10, 14);           // one order: too few for a range on its card
  await add("x1", "fast", "avg", 2, 2, 6, 900);           // forgot to press delivered for 15 hours
  await add("t1", "fast", "avg", 2, 0, 1, 1);             // a captain's practice order: 2 minutes door to door

  const lib = load({ "@workspace/db": { pool: { query: (sql, args) => pg.query(sql, args) } } });
  const l = await lib.loadLearnedTimes();

  assert.equal(Math.round(l.wait), 2);
  assert.equal(l.sample, 19, "18 + the new restaurant; the practice order and the 15-hour ride are left out");
  // A ride is a fixed part plus a per-km part — not km × pace from zero.
  assert.ok(l.rideFixed >= 6 && l.rideFixed <= 12, `fixed ${l.rideFixed}`);
  assert.ok(l.minutesPerKm >= 2.5 && l.minutesPerKm <= 5, `per km ${l.minutesPerKm}`);

  // Each restaurant's pickup leans on its own orders, pulled a little toward everyone's.
  assert.ok(l.byRestaurantId.fast.pickup > 6 && l.byRestaurantId.fast.pickup < 11, `fast ${l.byRestaurantId.fast.pickup}`);
  assert.ok(l.byRestaurantId.slow.pickup > 22 && l.byRestaurantId.slow.pickup < 30, `slow ${l.byRestaurantId.slow.pickup}`);
  assert.ok(l.byRestaurantId.new.pickup > 10 && l.byRestaurantId.new.pickup < 18, "one order barely moves it off the average");

  // The slow courier is recognised; a courier riding the usual way is not penalised.
  assert.ok(l.courierPace.slowpoke > 1.15, `slowpoke ${l.courierPace.slowpoke}`);
  assert.ok(l.courierPace.avg < 1.05, `avg ${l.courierPace.avg}`);

  assert.equal(lib.restaurantDeliveryRange("new", l), null, "under 5 orders: keep the dashboard text");
  assert.ok(lib.restaurantDeliveryRange("fast", l), "busy restaurants get a learned range");

  // The slow kitchen is quoted honestly.
  assert.ok(lib.estimateOrderMinutes(2, "slow", l) > lib.estimateOrderMinutes(2, "fast", l) + 10);
  await pg.close();
});

test("courier pace and the hour of the day shape the live estimate", () => {
  const lib = load({ "@workspace/db": { pool: {} } });
  const now = new Date("2026-11-12T17:00:00Z"); // 20:00 in Damascus
  const restaurant = { lat: 34.73, lon: 36.71 }, destination = { lat: 34.748, lon: 36.71 }; // ~2 km
  const base = { restaurant, destination, restaurantId: "r1", now, courierFresh: true };
  const l = {
    wait: 2, pickup: 10, minutesPerKm: 3, rideFixed: 8, sample: 100,
    byRestaurantId: { r1: { pickup: 20, totalLow: 30, totalHigh: 40, sample: 9 } },
    courierPace: { slow: 1.5 }, pickupByHour: Object.assign([], { 20: 1.5 }),
  };
  // Accepted just now at a busy hour: 20 × 1.5 pickup + (8 + 3 × 2) ride.
  assert.equal(lib.liveEtaMinutes({ ...base, status: "accepted", statusSince: now, courier: restaurant }, l), 44);
  // On the way, 1 km out: only the arrival half of the fixed time is left.
  const oneKmOut = { lat: 34.739, lon: 36.71 };
  assert.equal(lib.liveEtaMinutes({ ...base, status: "on_way", statusSince: now, courier: oneKmOut }, l), 7);
  assert.equal(lib.liveEtaMinutes({ ...base, status: "on_way", statusSince: now, courier: oneKmOut, courierId: "slow" }, l), 11);
  // An unknown courier rides at the average pace.
  assert.equal(lib.liveEtaMinutes({ ...base, status: "on_way", statusSince: now, courier: oneKmOut, courierId: "new" }, l), 7);
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
