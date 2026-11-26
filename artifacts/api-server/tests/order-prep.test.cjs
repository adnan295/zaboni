const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");

function load(mocks) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib/orderPrep.ts"), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const c = { exports: {}, require: (id) => { if (!(id in mocks)) throw new Error("Unmocked import " + id); return mocks[id]; },
    Date, Math, Number, String, Map, Set, Array, Promise, Error, JSON, Boolean, Object };
  vm.runInNewContext(js, c);
  return c.exports;
}

const T0 = new Date("2026-11-26T12:00:00Z");
const at = (sec) => new Date(T0.getTime() + sec * 1000);

async function setup() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE restaurants (id TEXT PRIMARY KEY, phone TEXT);
    CREATE TABLE orders (id TEXT PRIMARY KEY, user_id TEXT, courier_id TEXT NOT NULL DEFAULT '', courier_name TEXT DEFAULT '',
      status TEXT, order_type TEXT DEFAULT 'restaurant', restaurant_id TEXT, restaurant_name TEXT, restaurant_phone TEXT DEFAULT '', cancel_reason TEXT,
      total_price INTEGER DEFAULT 0, delivery_fee INTEGER DEFAULT 0, address TEXT DEFAULT '',
      created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ);
    CREATE TABLE order_status_history (id TEXT PRIMARY KEY, order_id TEXT, status TEXT, note TEXT);
    INSERT INTO restaurants VALUES ('mech', '0312223344');
  `);
  const pool = { query: (sql, args) => (args ? pg.query(sql, args) : pg.exec(sql).then((r) => r[r.length - 1] ?? { rows: [] })) };
  const lib = load({ "@workspace/db": { pool } });
  await lib.ensureOrderPrepSchema();
  const order = (id, over = {}) => pg.query(
    `INSERT INTO orders (id, user_id, status, order_type, restaurant_id, restaurant_name, total_price, delivery_fee, address, created_at)
     VALUES ($1, 'sara', $2, $3, 'mech', 'بروستد مشيعل', 400, 80, 'الحمرا', $4)`,
    [id, over.status ?? "searching", over.type ?? "restaurant", over.createdAt ?? T0],
  );
  return { pg, lib, order };
}

test("stages: received for a minute, then preparing; the app gets the stage, the courier details are kept for old apps", () => {
  const { customerStage, withStage, customerMayCancel } = load({ "@workspace/db": { pool: {} } });
  assert.equal(customerStage({ status: "searching" }), "received");
  assert.equal(customerStage({ status: "searching", prepStartedAt: T0 }), "preparing");
  assert.equal(customerStage({ status: "accepted" }), "preparing");
  assert.equal(customerStage({ status: "picked_up" }), "on_way");
  assert.equal(customerMayCancel({ status: "searching" }), true);
  assert.equal(customerMayCancel({ status: "searching", prepStartedAt: T0 }), false);
  assert.equal(customerMayCancel({ status: "searching", prepStartedAt: T0 }, true), true, "old apps keep the old rule");
  assert.equal(customerMayCancel({ status: "searching", adminOrderedAt: T0 }, true), false, "…unless the admin ordered it");
  const o = withStage({ status: "accepted", courierName: "هاشم", courierPhone: "0994" });
  assert.deepEqual([o.stage, o.courierName], ["preparing", "هاشم"], "the new app hides the courier from the stage");
});

test("after one minute with no courier the order starts preparing, once; errands keep waiting", async () => {
  const { pg, lib, order } = await setup();
  await order("o1");
  await order("err", { type: "errand" });
  assert.equal((await lib.startDuePrep(at(59))).length, 0, "not yet");
  const due = await lib.startDuePrep(at(61));
  assert.deepEqual(due.map((o) => o.id), ["o1"]);
  assert.equal(due[0].restaurantPhone, "0312223344", "the restaurant's own number when the order has none");
  assert.equal(due[0].total, 480);
  assert.equal((await lib.startDuePrep(at(120))).length, 0, "only once");
  assert.equal((await lib.dueSecondAlerts(at(61 + 599))).length, 0);
  assert.deepEqual((await lib.dueSecondAlerts(at(61 + 601))).map((o) => o.id), ["o1"]);
  assert.equal((await lib.dueSecondAlerts(at(61 + 900))).length, 0, "the second alert only once");
  await pg.close();
});

test("a courier taking it first means it is preparing, and the admin cannot order it again", async () => {
  const { pg, lib, order } = await setup();
  await order("o1");
  await pg.query(`UPDATE orders SET status = 'accepted', courier_id = 'hashem', courier_name = 'هاشم' WHERE id = 'o1'`);
  await lib.markPrepOnAccept("o1", at(30));
  const { rows: [r] } = await pg.query(`SELECT prep_started_at FROM orders WHERE id = 'o1'`);
  assert.equal(new Date(r.prep_started_at).getTime(), at(30).getTime());
  assert.equal((await lib.startDuePrep(at(90))).length, 0, "already preparing");
  await assert.rejects(lib.markOrderedByAdmin("o1", "admin"), (e) => e.code === "courier_took_it" && /هاشم/.test(e.message));
  await pg.close();
});

test("«طلبناه من المطعم» while nobody has it; pressing twice keeps the first time", async () => {
  const { pg, lib, order } = await setup();
  await order("o1");
  const first = await lib.markOrderedByAdmin("o1", "admin", at(70));
  const again = await lib.markOrderedByAdmin("o1", "admin", at(90));
  assert.equal(again.orderedAt.getTime(), first.orderedAt.getTime());
  await assert.rejects(lib.markOrderedByAdmin("nope", "admin"), (e) => e.code === "order_not_found");
  await pg.close();
});

test("admin hours: on all day by default, a window (also across midnight), and off", () => {
  const { autoPrepActive, parseAutoPrep, validAutoPrep } = load({ "@workspace/db": { pool: {} } });
  const homs = (h, m = 0) => new Date(Date.UTC(2026, 10, 26, h - 3, m)); // Homs is UTC+3
  assert.deepEqual(JSON.parse(JSON.stringify(parseAutoPrep(null))), { enabled: true, from: "00:00", to: "00:00" });
  assert.equal(autoPrepActive(parseAutoPrep(null), homs(4)), true, "all day");
  const day = { enabled: true, from: "10:00", to: "23:30" };
  assert.equal(autoPrepActive(day, homs(9, 59)), false);
  assert.equal(autoPrepActive(day, homs(10)), true);
  assert.equal(autoPrepActive(day, homs(23, 30)), false);
  const night = { enabled: true, from: "12:00", to: "02:00" };
  assert.equal(autoPrepActive(night, homs(1, 30)), true, "past midnight");
  assert.equal(autoPrepActive(night, homs(3)), false);
  assert.equal(autoPrepActive({ ...day, enabled: false }, homs(12)), false, "switched off");
  assert.equal(validAutoPrep({ enabled: true, from: "25:00", to: "10:00" }), false);
});

test("switched off: «جاري إرسال طلبك», and cancelled after five minutes unless someone acted on it", async () => {
  const { pg, lib, order } = await setup();
  assert.equal(lib.customerStage({ status: "searching" }, false), "sending");
  assert.equal(lib.customerMayCancel({ status: "searching" }), true);
  await order("o1");
  await order("ordered");
  await order("taken");
  await order("err", { type: "errand" });
  await pg.query(`UPDATE orders SET admin_ordered_at = $1 WHERE id = 'ordered'`, [at(60)]);
  await pg.query(`UPDATE orders SET status = 'accepted', courier_id = 'hashem' WHERE id = 'taken'`);
  assert.equal((await lib.expireUnsent(at(299))).length, 0, "not before five minutes");
  const gone = await lib.expireUnsent(at(301));
  assert.deepEqual(gone.map((o) => o.id), ["o1"]);
  const { rows } = await pg.query(`SELECT id, status FROM orders ORDER BY id`);
  assert.deepEqual(rows.map((r) => `${r.id}:${r.status}`), ["err:searching", "o1:cancelled", "ordered:searching", "taken:accepted"]);
  const { rows: h } = await pg.query(`SELECT note FROM order_status_history WHERE order_id = 'o1'`);
  assert.equal(h[0].note, "auto_expired", "the customer's screen explains why");
  await pg.close();
});
