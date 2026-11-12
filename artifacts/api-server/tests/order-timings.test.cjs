const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");

function load(mocks) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib/orderTimings.ts"), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const c = { exports: {}, require: (id) => { if (!(id in mocks)) throw new Error("Unmocked import " + id); return mocks[id]; }, Map, Date, Math, String };
  vm.runInNewContext(js, c);
  return c.exports;
}

test("order timings: wait, pickup and delivery minutes; re-accepted orders use the last courier", async () => {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE order_status_history (id TEXT PRIMARY KEY, order_id TEXT, status TEXT, note TEXT, created_at TIMESTAMPTZ);
    INSERT INTO order_status_history VALUES
      ('a1','o1','accepted', NULL,'2026-11-01T10:05:00Z'),
      ('a2','o1','picked_up',NULL,'2026-11-01T10:15:00Z'),
      ('a3','o1','delivered',NULL,'2026-11-01T10:32:00Z'),
      -- o2: first courier accepted then dropped it, a second one delivered
      ('b1','o2','accepted', NULL,'2026-11-01T11:02:00Z'),
      ('b2','o2','searching','courier_cancelled:c1','2026-11-01T11:10:00Z'),
      ('b3','o2','accepted', NULL,'2026-11-01T11:20:00Z'),
      ('b4','o2','delivered',NULL,'2026-11-01T11:45:00Z'),
      -- o3: accepted, still on the road
      ('c1','o3','accepted', NULL,'2026-11-01T12:03:00Z');
  `);
  const lib = load({ "@workspace/db": { pool: { query: (sql, args) => pg.query(sql, args) } } });
  const t = await lib.getOrderTimings([
    { id: "o1", createdAt: "2026-11-01T10:00:00Z" },
    { id: "o2", createdAt: "2026-11-01T11:00:00Z" },
    { id: "o3", createdAt: "2026-11-01T12:00:00Z" },
    { id: "o4", createdAt: "2026-11-01T13:00:00Z" },
  ]);

  assert.equal(t.o1.waitMinutes, 5);
  assert.equal(t.o1.pickupMinutes, 10);
  assert.equal(t.o1.deliveryMinutes, 27, "accepted 10:05 → delivered 10:32");
  assert.equal(t.o1.totalMinutes, 32);

  assert.equal(t.o2.deliveryMinutes, 25, "counted from the courier who actually delivered");
  assert.equal(t.o2.waitMinutes, 20);
  assert.equal(t.o2.totalMinutes, 45);

  assert.equal(t.o3.waitMinutes, 3);
  assert.equal(t.o3.deliveryMinutes, null, "not delivered yet");

  assert.equal(t.o4.acceptedAt, null, "no history at all");
  assert.equal(t.o4.deliveryMinutes, null);

  assert.equal(Object.keys(await lib.getOrderTimings([])).length, 0);
  await pg.close();
});

test("speed report: slow restaurant and slow courier are flagged against the overall average", async () => {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, phone TEXT);
    CREATE TABLE orders (id TEXT PRIMARY KEY, courier_id TEXT, restaurant_name TEXT, status TEXT, created_at TIMESTAMPTZ);
    CREATE TABLE order_status_history (id TEXT PRIMARY KEY, order_id TEXT, status TEXT, note TEXT, created_at TIMESTAMPTZ);
    INSERT INTO users VALUES ('cf','سريع','0911'),('cs','بطيء','0922');
  `);
  // 6 orders each. Fast kitchen + fast courier: pickup 5, ride 10. Slow kitchen + slow courier: pickup 25, ride 40.
  const add = async (id, courier, rest, pickup, ride) => {
    await pg.query(`INSERT INTO orders VALUES ($1,$2,$3,'delivered', NOW() - INTERVAL '3 hours')`, [id, courier, rest]);
    await pg.query(`INSERT INTO order_status_history VALUES
      ($1 || 'a', $1, 'accepted',  NULL, NOW() - INTERVAL '3 hours' + INTERVAL '2 minutes'),
      ($1 || 'p', $1, 'picked_up', NULL, NOW() - INTERVAL '3 hours' + make_interval(mins => 2 + $2::int)),
      ($1 || 'd', $1, 'delivered', NULL, NOW() - INTERVAL '3 hours' + make_interval(mins => 2 + $2::int + $3::int))`, [id, pickup, ride]);
  };
  for (let i = 0; i < 6; i++) { await add("f" + i, "cf", "مطعم سريع", 5, 10); await add("s" + i, "cs", "مطعم بطيء", 25, 40); }
  // Someone forgot to press "delivered" for 10 hours: must not poison the averages.
  await add("x1", "cf", "مطعم سريع", 5, 600);
  // Old order outside the window, and an undelivered one: ignored.
  await pg.exec(`INSERT INTO orders VALUES ('old','cf','مطعم سريع','delivered', NOW() - INTERVAL '60 days'),('live','cf','مطعم سريع','on_way', NOW())`);

  const lib = load({ "@workspace/db": { pool: { query: (sql, args) => pg.query(sql, args) } } });
  const r = JSON.parse(JSON.stringify(await lib.getSpeedReport(30)));

  assert.equal(r.orders, 13);
  assert.equal(r.overall.avgWaitMinutes, 2);
  assert.equal(r.overall.avgRideMinutes, 25, "10-hour outlier excluded: (6×10 + 6×40) / 12");
  assert.deepEqual(r.restaurants.map((x) => [x.name, x.avgPickupMinutes, x.verdict]), [["مطعم بطيء", 25, "slow"], ["مطعم سريع", 5, "fast"]]);
  assert.deepEqual(r.couriers.map((x) => [x.name, x.avgRideMinutes, x.verdict]), [["بطيء", 40, "slow"], ["سريع", 10, "fast"]]);
  assert.equal(r.couriers[1].deliveries, 7);
  assert.equal(lib.speedVerdict(40, 25, 4), "few_orders", "under 5 orders: no verdict");
  await pg.close();
});
