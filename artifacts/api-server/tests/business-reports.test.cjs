const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");
const noop = () => {};

function load(file, mocks) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src", file), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const c = { exports: {}, require: (id) => { if (!(id in mocks)) throw new Error("Unmocked import " + id); return mocks[id]; },
    Date, Number, Math, Object, String, console, setInterval: () => ({ unref: noop }) };
  vm.runInNewContext(js, c, { filename: file });
  return c.exports;
}

// Real PostgreSQL semantics via PGlite, with the production tables these
// reports read (the subset of columns they touch).
async function setup() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT DEFAULT '', phone TEXT DEFAULT '', role TEXT, is_online BOOLEAN DEFAULT false, is_blocked BOOLEAN DEFAULT false);
    CREATE TABLE orders (id TEXT PRIMARY KEY, user_id TEXT, restaurant_id TEXT, courier_id TEXT DEFAULT '', status TEXT,
      delivery_fee INTEGER DEFAULT 0, total_price INTEGER, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE courier_subscriptions (id TEXT PRIMARY KEY, courier_id TEXT, plan_name TEXT, plan_period TEXT, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ,
      amount INTEGER DEFAULT 0, status TEXT, is_active BOOLEAN DEFAULT true, gifted BOOLEAN DEFAULT false);
    CREATE TABLE order_ratings (id TEXT PRIMARY KEY, courier_id TEXT, restaurant_id TEXT, courier_stars INTEGER DEFAULT 0, restaurant_stars INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE restaurants (id TEXT PRIMARY KEY, name_ar TEXT, image TEXT DEFAULT '', is_open BOOLEAN DEFAULT true);
  `);
  const run = async (sql, args) => {
    if (!args && /CREATE (TABLE|INDEX|UNIQUE INDEX)/.test(sql)) { await pg.exec(sql); return { rows: [], rowCount: 0 }; }
    const r = await pg.query(sql, args);
    return { ...r, rowCount: r.affectedRows ?? r.rows.length };
  };
  const pool = { query: run };
  const activity = load("lib/courierActivity.ts", { "@workspace/db": { pool }, "./logger": { logger: { warn: noop } } });
  await activity.ensureCourierActivitySchema();
  const reports = load("lib/businessReports.ts", { "@workspace/db": { pool } });
  return { pg, activity, reports };
}

test("courier economics: subscription vs earnings, hours, offers, verdicts", async () => {
  const { pg, activity, reports } = await setup();
  await pg.exec(`
    INSERT INTO users (id,name,phone,role,is_online) VALUES ('c_good','سامر','+9631','courier',true),('c_bad','أحمد','+9632','courier',false),
      ('c_idle','خالد','+9633','courier',false),('c_free','وليد','+9634','courier',false),('cust','زبون','+9639','customer',false);
    -- monthly plan 100k, started 10 days ago → within a 30-day window all 10 days overlap: cost = 100000 * 10/30
    INSERT INTO courier_subscriptions VALUES
      ('s1','c_good','شهري','monthly',NOW()-INTERVAL '10 days',NOW()+INTERVAL '20 days',100000,'paid',true,false),
      ('s2','c_bad','أسبوعي','weekly',NOW()-INTERVAL '5 days',NOW()+INTERVAL '2 days',50000,'paid',true,false),
      ('s3','c_idle','أسبوعي','weekly',NOW()-INTERVAL '6 days',NOW()+INTERVAL '1 days',50000,'paid',true,false),
      ('s4','c_free','هدية','weekly',NOW()-INTERVAL '3 days',NOW()+INTERVAL '4 days',50000,'waived',true,true);
    -- c_good: 20 deliveries × 5000 = 100000 earnings (3× its 33k pro-rated cost)
    INSERT INTO orders SELECT 'g'||g, 'cust', 'r1', 'c_good', 'delivered', 5000, 20000, NOW()-INTERVAL '2 days' FROM generate_series(1,20) g;
    -- c_bad: 4 deliveries × 5000 = 20000 (< 50000 paid) + 1 cancelled after accept
    INSERT INTO orders SELECT 'b'||g, 'cust', 'r1', 'c_bad', 'delivered', 5000, 15000, NOW()-INTERVAL '1 days' FROM generate_series(1,4) g;
    INSERT INTO orders VALUES ('bx','cust','r1','c_bad','cancelled',5000,15000,NOW()-INTERVAL '1 days');
    -- c_free: delivers without paying
    INSERT INTO orders VALUES ('f1','cust','r2','c_free','delivered',4000,9000,NOW()-INTERVAL '1 days');
    INSERT INTO order_ratings VALUES ('rt1','c_good','r1',5,4,NOW()),('rt2','c_good','r1',4,5,NOW());
  `);
  // c_bad was online 10h (one closed session) and was offered 10 orders, accepted 4
  await pg.exec(`INSERT INTO courier_online_sessions (courier_id, started_at, ended_at, last_seen_at)
    VALUES ('c_bad', NOW()-INTERVAL '30 hours', NOW()-INTERVAL '20 hours', NOW()-INTERVAL '20 hours')`);
  await activity.recordOffers("b1", ["c_bad", "c_good"]);
  for (const id of ["b2", "b3", "b4", "g1", "g2", "g3", "g4", "g5", "g6"]) await activity.recordOffers(id, ["c_bad"]);

  const r = await reports.getCourierEconomics(30);
  const by = Object.fromEntries(r.couriers.map((c) => [c.id, c]));

  assert.equal(by.c_good.subscriptionCost, 33333);
  assert.equal(by.c_good.earnings, 100000);
  assert.equal(by.c_good.deliveries, 20);
  assert.equal(by.c_good.returnRatio, 3);
  assert.equal(by.c_good.verdict, "profitable");
  assert.equal(by.c_good.avgRating, 4.5);
  assert.equal(by.c_good.plan.name, "شهري");
  assert.ok(by.c_good.plan.daysLeft >= 19 && by.c_good.plan.daysLeft <= 20);

  // weekly plan, 5 of its 7 days fall inside the window (2 remain in the future): 50000 × 5/7
  assert.equal(by.c_bad.subscriptionCost, 35714);
  assert.equal(by.c_bad.earnings, 20000);
  assert.equal(by.c_bad.verdict, "losing");
  assert.equal(by.c_bad.cancelledAfterAccept, 1);
  assert.equal(by.c_bad.onlineHours, 10);
  assert.equal(by.c_bad.activeDays, 1);
  assert.equal(by.c_bad.offers, 10);
  assert.equal(by.c_bad.accepted, 4, "accepted = offered orders he ended up delivering/holding");
  assert.equal(by.c_bad.acceptanceRate, 0.4);
  assert.equal(by.c_bad.deliveriesPerOnlineHour, 0.4);
  assert.equal(by.c_bad.earningsPerOnlineHour, 2000);

  assert.equal(by.c_idle.verdict, "inactive");
  assert.match(by.c_idle.verdictReason, /ما فتح التطبيق/);
  assert.equal(by.c_free.subscriptionCost, 0, "waived subscriptions are not revenue");
  assert.equal(by.c_free.verdict, "no_subscription");

  // c_good 33333 + c_bad 35714 + c_idle 50000×6/7=42857; c_free waived → 0
  assert.equal(r.totals.subscriptionRevenue, 33333 + 35714 + 42857);
  assert.equal(r.totals.deliveries, 25);
  assert.equal(r.totals.byVerdict.profitable, 1);
  assert.equal(r.totals.byVerdict.losing, 1);
  assert.equal(r.totals.renewalRisk, 1, "c_bad: losing and ends within 7 days; c_idle has no deliveries → inactive, not counted");
  assert.equal(r.hasActivityData, true);

  // a 7-day window pro-rates c_good's monthly plan to 7/30
  const week = await reports.getCourierEconomics(7);
  assert.equal(week.couriers.find((c) => c.id === "c_good").subscriptionCost, 23333);
});

test("online sessions: toggles, pings, stale auto-close, no duplicate open session", async () => {
  const { pg, activity } = await setup();
  await pg.exec(`INSERT INTO users (id, role) VALUES ('c1','courier')`);
  await activity.recordAvailability("c1", true);
  await activity.recordAvailability("c1", true); // double tap
  let { rows } = await pg.query(`SELECT count(*)::int n FROM courier_online_sessions WHERE courier_id='c1' AND ended_at IS NULL`);
  assert.equal(rows[0].n, 1);
  await activity.recordAvailability("c1", false);
  ({ rows } = await pg.query(`SELECT count(*)::int n FROM courier_online_sessions WHERE courier_id='c1' AND ended_at IS NOT NULL`));
  assert.equal(rows[0].n, 1);

  // forgot to go offline: last ping 20h ago → closed at that ping, not now
  await pg.exec(`INSERT INTO courier_online_sessions (courier_id, started_at, last_seen_at)
    VALUES ('c1', NOW()-INTERVAL '26 hours', NOW()-INTERVAL '20 hours')`);
  assert.equal(await activity.closeStaleSessions(), 1);
  ({ rows } = await pg.query(`SELECT EXTRACT(EPOCH FROM (ended_at - started_at))/3600 AS h FROM courier_online_sessions WHERE started_at < NOW()-INTERVAL '25 hours'`));
  assert.ok(Math.abs(Number(rows[0].h) - 6) < 0.01, "6 hours, not 26");

  // a recent ping keeps a session open
  await activity.recordAvailability("c1", true);
  await activity.touchOnlineSession("c1");
  assert.equal(await activity.closeStaleSessions(), 0);
});

test("restaurant sales: GMV, ticket, customers, trend and simulated commission", async () => {
  const { pg, reports } = await setup();
  await pg.exec(`
    INSERT INTO restaurants (id, name_ar) VALUES ('r1','أوتاكوس'),('r2','كالزوني'),('r3','مطعم نايم');
    INSERT INTO users (id, role) VALUES ('u1','customer'),('u2','customer');
    INSERT INTO orders VALUES
      ('o1','u1','r1','c','delivered',3000,40000,NOW()-INTERVAL '1 day'),
      ('o2','u2','r1','c','delivered',3000,60000,NOW()-INTERVAL '2 days'),
      ('o3','u1','r1','','cancelled',3000,20000,NOW()-INTERVAL '2 days'),
      ('o4','u1','r1','c','delivered',3000,50000,NOW()-INTERVAL '10 days'),   -- previous 7-day period
      ('o5','u2','r2','c','delivered',2000,10000,NOW()-INTERVAL '3 days');
  `);
  const r = await reports.getRestaurantSales(7, 10);
  const by = Object.fromEntries(r.restaurants.map((x) => [x.id, x]));
  assert.equal(by.r1.gmv, 100000);
  assert.equal(by.r1.delivered, 2);
  assert.equal(by.r1.orders, 3);
  assert.equal(by.r1.cancellationRate, 0.33);
  assert.equal(by.r1.avgTicket, 50000);
  assert.equal(by.r1.customers, 2);
  assert.equal(by.r1.gmvChange, 1, "100k now vs 50k in the previous 7 days = +100%");
  assert.equal(by.r1.commissionAt, 10000);
  assert.equal(by.r3.gmv, 0);
  assert.equal(by.r3.gmvChange, null);
  assert.equal(r.totals.gmv, 110000);
  assert.equal(r.totals.commissionAt, 11000);
  assert.equal(r.totals.activeRestaurants, 2);
  assert.equal(r.restaurants[0].id, "r1", "sorted by GMV");
});
