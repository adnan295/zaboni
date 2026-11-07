const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");

function load(mocks) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib/todayPulse.ts"), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const c = { exports: {}, require: (id) => { if (!(id in mocks)) throw new Error("Unmocked import " + id); return mocks[id]; }, Array, Number, String, Promise };
  vm.runInNewContext(js, c);
  return c.exports;
}

test("today pulse: today vs yesterday vs last week, new vs returning, now-box", async () => {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, role TEXT, is_online BOOLEAN DEFAULT false, is_blocked BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW() - INTERVAL '60 days');
    CREATE TABLE orders (id TEXT PRIMARY KEY, user_id TEXT, courier_id TEXT DEFAULT '', status TEXT, total_price INTEGER, delivery_fee INTEGER DEFAULT 0, created_at TIMESTAMPTZ);
    CREATE TABLE courier_subscriptions (id TEXT PRIMARY KEY, courier_id TEXT, status TEXT, gifted BOOLEAN DEFAULT false, is_active BOOLEAN DEFAULT true, amount INTEGER, ends_at TIMESTAMPTZ, created_at TIMESTAMPTZ);
    CREATE TABLE courier_subscription_requests (id TEXT PRIMARY KEY, status TEXT);
    CREATE TABLE courier_applications (id TEXT PRIMARY KEY, status TEXT);
    CREATE TABLE support_tickets (id TEXT PRIMARY KEY, status TEXT);
    INSERT INTO users VALUES ('c1','courier',true,false,NOW() - INTERVAL '60 days'),('c2','courier',false,false,NOW() - INTERVAL '2 minutes'),
      ('u_new','customer',false,false,NOW() - INTERVAL '6 minutes'),('u_old','customer',false,false,NOW() - INTERVAL '60 days'),
      -- registered today but never ordered: still a signup
      ('u_browsing','customer',false,false,NOW() - INTERVAL '1 minute'),
      ('u_yesterday','customer',false,false,NOW() - INTERVAL '1 day');
    -- "today" = Damascus day containing NOW(). Use small offsets from NOW() so they stay inside today
    -- (tests near midnight could straddle; offsets are minutes so the risk is negligible).
    INSERT INTO orders VALUES
      ('t1','u_new','c1','delivered',30000,3000,NOW() - INTERVAL '5 minutes'),
      ('t2','u_old','c1','delivered',20000,3000,NOW() - INTERVAL '4 minutes'),
      ('t3','u_old','',  'cancelled',10000,3000,NOW() - INTERVAL '3 minutes'),
      ('t4','u_old','',  'searching',15000,3000,NOW() - INTERVAL '9 minutes'),
      -- yesterday
      ('y1','u_old','c2','delivered',50000,3000,NOW() - INTERVAL '1 day'),
      -- same weekday last week
      ('w1','u_old','c2','delivered',40000,3000,NOW() - INTERVAL '7 days'),
      ('w2','u_old','c2','delivered',40000,3000,NOW() - INTERVAL '7 days 1 hour'),
      -- long ago: makes u_old a returning customer
      ('o1','u_old','c2','delivered',10000,3000,NOW() - INTERVAL '40 days');
    INSERT INTO courier_subscriptions VALUES
      ('s1','c1','paid',false,true,100000,NOW() + INTERVAL '2 days',NOW() - INTERVAL '10 minutes'),
      ('s2','c2','waived',true,true,0,NOW() + INTERVAL '20 days',NOW() - INTERVAL '10 minutes'),
      ('s3','c2','paid',false,true,50000,NOW() + INTERVAL '20 days',NOW() - INTERVAL '1 day');
    INSERT INTO courier_subscription_requests VALUES ('r1','pending'),('r2','approved');
    INSERT INTO courier_applications VALUES ('a1','pending');
    INSERT INTO support_tickets VALUES ('k1','open'),('k2','resolved');
  `);
  const lib = load({ "@workspace/db": { pool: { query: (sql, args) => pg.query(sql, args) } } });
  const p = await lib.getTodayPulse(5);

  assert.equal(p.today.orders, 4);
  assert.equal(p.today.delivered, 2);
  assert.equal(p.today.cancelled, 1);
  assert.equal(p.today.gmv, 50000, "delivered only");
  assert.equal(p.today.newCustomers, 1, "u_new's first ever order is today");
  assert.equal(p.today.returningCustomers, 1, "u_old ordered 40 days ago");
  assert.equal(p.today.orderingCustomers, 2);
  assert.equal(p.today.subscriptions, 1, "gifted/waived subscription is not a sale");
  assert.equal(p.today.subscriptionRevenue, 100000);
  assert.equal(p.today.activeCouriers, 1);
  assert.equal(p.today.signups, 2, "u_new and u_browsing registered today; ordering is irrelevant");
  assert.equal(p.today.courierSignups, 1, "c2 registered today");
  assert.equal(p.yesterday.signups, 1, "u_yesterday");

  assert.equal(p.yesterday.orders, 1);
  assert.equal(p.yesterday.gmv, 50000);
  assert.equal(p.yesterday.subscriptions, 1);
  assert.equal(p.lastWeek.orders, 2);
  assert.equal(p.lastWeek.gmv, 80000);

  assert.equal(p.now.searching, 1);
  assert.equal(p.now.inProgress, 0);
  assert.equal(p.now.couriersOnline, 1);
  assert.equal(p.now.stuck, 1, "t4 has been searching for 9 min > 5 min threshold");
  assert.equal(p.now.pendingSubscriptionRequests, 1);
  assert.equal(p.now.pendingCourierApplications, 1);
  assert.equal(p.now.openSupportTickets, 1);
  assert.equal(p.now.subscriptionsEndingSoon, 1, "s1 ends in 2 days");

  assert.equal(p.hourly.length, 24);
  assert.equal(p.hourly.reduce((a, b) => a + b, 0), 4, "all of today's orders land in some hour");
  assert.match(p.date, /^\d{4}-\d{2}-\d{2}$/);
  await pg.close();
});
