const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");

function load(mocks) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib/kitchen.ts"), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const c = { exports: {}, require: (id) => { if (!(id in mocks)) throw new Error("Unmocked import " + id); return mocks[id]; },
    Date, Math, Number, String, Map, Set, Array, Promise, Error, setInterval: () => ({ unref() {} }) };
  vm.runInNewContext(js, c);
  return c.exports;
}

// "Now" is Thursday 2026-11-19 18:00 Damascus (15:00 UTC): tomorrow's ordering closes at 21:00.
const NOW = new Date("2026-11-19T15:00:00Z");
const FRI = "2026-11-20", SAT = "2026-11-21", SUN = "2026-11-22", MON = "2026-11-23";

async function setup({ enabled = true } = {}) {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, phone TEXT);
    CREATE TABLE restaurants (id TEXT PRIMARY KEY, name_ar TEXT, phone TEXT, rating REAL DEFAULT 0, review_count INT DEFAULT 0, is_open BOOLEAN DEFAULT true, lat REAL, lon REAL);
    CREATE TABLE menu_items (id TEXT PRIMARY KEY, restaurant_id TEXT, name_ar TEXT, description_ar TEXT DEFAULT '', image TEXT DEFAULT '', price REAL, is_available BOOLEAN DEFAULT true);
    CREATE TABLE orders (id TEXT PRIMARY KEY, user_id TEXT, order_text TEXT, restaurant_name TEXT, restaurant_phone TEXT, restaurant_id TEXT, status TEXT,
      courier_id TEXT DEFAULT '', address TEXT, destination_lat DOUBLE PRECISION, destination_lon DOUBLE PRECISION, delivery_fee INT, total_price INT,
      estimated_minutes INT, order_type TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE order_items (id TEXT PRIMARY KEY, order_id TEXT, menu_item_id TEXT, name_ar TEXT, unit_price INT, qty INT, line_total INT, note TEXT);
    CREATE TABLE order_status_history (id TEXT PRIMARY KEY, order_id TEXT, status TEXT, note TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
  `);
  const pool = { query: (sql, args) => (args ? pg.query(sql, args) : pg.exec(sql).then((r) => r[r.length - 1] ?? { rows: [] })),
    connect: async () => ({ query: (sql, args) => pg.query(sql, args), release() {} }) };
  const lib = load({ "@workspace/db": { pool }, "./logger": { logger: { warn() {}, error() {} } } });
  await lib.ensureKitchenSchema();
  await pg.exec(`
    INSERT INTO users VALUES ('u1','خضر','+963911111111'),('u2','وليد','+963922222222');
    INSERT INTO restaurants (id, name_ar, phone, lat, lon, kind) VALUES
      ('k1','مطبخ أم خالد','+963933333333',34.73,36.71,'kitchen'),
      ('k2','مطبخ الست هدى','',34.74,36.72,'kitchen'),
      ('r1','بروستد مشيعل','',34.73,36.71,'restaurant');
    INSERT INTO menu_items (id, restaurant_id, name_ar, price) VALUES
      ('m_freekeh','k1','فريكة بدجاج',450),('m_kabsa','k1','كبسة دجاج',480),('m_shish','k2','شيش طاووق وخضرة',520),('m_broast','r1','وجبة بروستد',900);
    INSERT INTO kitchen_meal_days (menu_item_id, day, portions) VALUES
      ('m_freekeh','${FRI}',3),('m_kabsa','${FRI}',10),('m_shish','${FRI}',5),
      ('m_freekeh','${SAT}',5),('m_freekeh','${SUN}',5),('m_shish','${MON}',5);
    ${enabled ? "INSERT INTO system_settings VALUES ('kitchen_enabled','true');" : ""}
  `);
  const quote = async () => 150;
  const base = { userId: "u1", window: "13-14", address: "الحمرا، جانب الصيدلية", lat: 34.7301, lon: 36.7092 };
  return { pg, lib, quote, base };
}

const j = (v) => JSON.parse(JSON.stringify(v));
const code = async (p) => { try { await p; return "ok"; } catch (e) { return e.code ?? String(e); } };

test("days: tomorrow is open until the evening cutoff, then closed", async () => {
  const { pg, lib } = await setup();
  const s = await lib.getKitchenSettings();
  assert.equal(s.enabled, true);
  assert.equal(s.cutoffHour, 21);
  const days = JSON.parse(JSON.stringify(lib.listDays(s, NOW)));
  assert.equal(days.length, 7);
  assert.deepEqual([days[0].day, days[0].open], [FRI, true]);
  assert.equal(days[0].closesAt, "2026-11-19T18:00:00.000Z", "21:00 Damascus the evening before");
  const late = lib.listDays(s, new Date("2026-11-19T18:30:00Z"));
  assert.deepEqual([late[0].day, late[0].open, late[1].open], [FRI, false, true], "after 21:00 tomorrow is closed, the day after is open");
  assert.equal(lib.releaseAt(FRI, "13-14", s).toISOString(), "2026-11-20T09:15:00.000Z", "45 minutes before 13:00 Damascus");
  await pg.close();
});

test("menu lists only kitchen meals with portions for that day", async () => {
  const { pg, lib } = await setup();
  const menu = JSON.parse(JSON.stringify(await lib.getMenu(FRI)));
  assert.deepEqual(menu.map((m) => m.id).sort(), ["m_freekeh", "m_kabsa", "m_shish"]);
  assert.equal(menu.find((m) => m.id === "m_freekeh").left, 3);
  assert.equal((await lib.getMenu(MON)).length, 1);
  assert.equal(await lib.getMeal("m_broast", FRI), null, "a restaurant's item is never a kitchen meal");
  await pg.close();
});

test("placing an order reserves portions, splits per kitchen, and stores a scheduled order", async () => {
  const { pg, lib, quote, base } = await setup();
  const placed = JSON.parse(JSON.stringify(await lib.placeOrder(
    { ...base, day: FRI, items: [{ mealId: "m_freekeh", qty: 2 }, { mealId: "m_shish", qty: 1 }] }, quote, NOW)));
  assert.equal(placed.length, 2, "one order per kitchen");
  const k1 = placed.find((o) => o.kitchenId === "k1");
  assert.equal(k1.itemsTotal, 900);
  assert.equal(k1.deliveryFee, 150);
  assert.match(k1.orderText, /فريكة بدجاج × 2/);

  const { rows } = await pg.query(`SELECT status, TO_CHAR(scheduled_day,'YYYY-MM-DD') AS day, scheduled_window, total_price, placed_at IS NOT NULL AS has_placed FROM orders WHERE id = $1`, [k1.id]);
  assert.deepEqual(rows[0], { status: "scheduled", day: FRI, scheduled_window: "13-14", total_price: 900, has_placed: true });
  assert.equal((await pg.query(`SELECT qty, line_total FROM order_items WHERE order_id = $1`, [k1.id])).rows[0].line_total, 900);
  assert.equal((await lib.getMeal("m_freekeh", FRI)).left, 1);
  await pg.close();
});

test("the last portion cannot be sold twice, and a failed order keeps nothing", async () => {
  const { pg, lib, quote, base } = await setup();
  await lib.placeOrder({ ...base, day: FRI, items: [{ mealId: "m_freekeh", qty: 2 }] }, quote, NOW);
  // u2 wants 2 of freekeh (only 1 left) together with kabsa: the whole order must fail and kabsa stay untouched.
  assert.equal(await code(lib.placeOrder({ ...base, userId: "u2", day: FRI, items: [{ mealId: "m_kabsa", qty: 1 }, { mealId: "m_freekeh", qty: 2 }] }, quote, NOW)), "sold_out");
  assert.equal((await lib.getMeal("m_kabsa", FRI)).left, 10, "rolled back");
  assert.equal((await pg.query(`SELECT COUNT(*)::int AS n FROM orders WHERE user_id = 'u2'`)).rows[0].n, 0);
  assert.equal(await code(lib.placeOrder({ ...base, userId: "u2", day: FRI, items: [{ mealId: "m_freekeh", qty: 1 }] }, quote, NOW)), "ok");
  assert.equal((await lib.getMeal("m_freekeh", FRI)).left, 0);
  await pg.close();
});

test("ordering is refused when closed, out of range, unknown, or switched off", async () => {
  const { pg, lib, quote, base } = await setup();
  const item = [{ mealId: "m_freekeh", qty: 1 }];
  assert.equal(await code(lib.placeOrder({ ...base, day: FRI, items: item }, quote, new Date("2026-11-19T18:30:00Z"))), "day_closed");
  assert.equal(await code(lib.placeOrder({ ...base, day: "2026-11-19", items: item }, quote, NOW)), "day_out_of_range", "today is never orderable");
  assert.equal(await code(lib.placeOrder({ ...base, day: FRI, window: "09-10", items: item }, quote, NOW)), "bad_window");
  assert.equal(await code(lib.placeOrder({ ...base, day: MON, items: item }, quote, NOW)), "meal_unavailable", "no portions that day");
  assert.equal(await code(lib.placeOrder({ ...base, day: FRI, items: [{ mealId: "m_broast", qty: 1 }] }, quote, NOW)), "meal_unavailable", "restaurant items cannot be pre-ordered");
  assert.equal(await code(lib.placeOrder({ ...base, day: FRI, items: [{ mealId: "m_freekeh", qty: 0 }] }, quote, NOW)), "bad_items");
  const KErr = lib.KitchenError;
  assert.equal(await code(lib.placeOrder({ ...base, day: FRI, items: item }, async () => { throw new KErr("outside_delivery_area", "x"); }, NOW)), "outside_delivery_area");
  assert.equal((await lib.getMeal("m_freekeh", FRI)).left, 3, "nothing reserved by any refused order");
  await pg.close();

  const off = await setup({ enabled: false });
  assert.equal(await code(off.lib.placeOrder({ ...off.base, day: FRI, items: item }, off.quote, NOW)), "kitchen_disabled");
  await off.pg.close();
});

test("cancelling before the cutoff returns the portions; after it the kitchen is cooking", async () => {
  const { pg, lib, quote, base } = await setup();
  const [o] = await lib.placeOrder({ ...base, day: FRI, items: [{ mealId: "m_freekeh", qty: 2 }] }, quote, NOW);
  assert.equal(await code(lib.cancelScheduledOrder("u2", o.id, NOW)), "not_found", "someone else's order");
  assert.equal(await code(lib.cancelScheduledOrder("u1", o.id, new Date("2026-11-19T18:30:00Z"))), "too_late");
  assert.equal((await lib.getMeal("m_freekeh", FRI)).left, 1);
  await lib.cancelScheduledOrder("u1", o.id, NOW);
  assert.equal((await pg.query(`SELECT status FROM orders WHERE id = $1`, [o.id])).rows[0].status, "cancelled");
  assert.equal((await lib.getMeal("m_freekeh", FRI)).left, 3, "portions back on sale");
  assert.equal(await code(lib.cancelScheduledOrder("u1", o.id, NOW)), "not_found", "already cancelled");
  await pg.close();
});

test("subscription: one discounted order per day, all or nothing, cancellable day by day", async () => {
  const { pg, lib, quote, base } = await setup();
  const days = [{ day: FRI, mealId: "m_freekeh" }, { day: SAT, mealId: "m_freekeh" }, { day: SUN, mealId: "m_freekeh" }];
  assert.equal(await code(lib.placeSubscription({ ...base, goal: "balanced", days: days.slice(0, 2) }, quote, NOW)), "too_few_days");
  assert.equal(await code(lib.placeSubscription({ ...base, goal: "balanced", days: [...days.slice(0, 2), { day: FRI, mealId: "m_kabsa" }] }, quote, NOW)), "duplicate_day");
  // A day without that meal fails the whole subscription and reserves nothing.
  assert.equal(await code(lib.placeSubscription({ ...base, goal: "balanced", days: [...days.slice(0, 2), { day: MON, mealId: "m_freekeh" }] }, quote, NOW)), "meal_unavailable");
  assert.equal((await lib.getMeal("m_freekeh", FRI)).left, 3);
  assert.equal((await pg.query(`SELECT COUNT(*)::int AS n FROM meal_subscriptions`)).rows[0].n, 0);

  const sub = JSON.parse(JSON.stringify(await lib.placeSubscription({ ...base, goal: "balanced", days }, quote, NOW)));
  assert.equal(sub.orders.length, 3);
  assert.equal(sub.discountPct, 10);
  assert.equal(sub.orders[0].itemsTotal, 405, "450 less 10%");
  assert.equal(sub.total, 3 * (405 + 150));
  assert.deepEqual(sub.orders.map((o) => o.day), [FRI, SAT, SUN]);

  const list = JSON.parse(JSON.stringify(await lib.listSubscriptions("u1")));
  assert.equal(list[0].upcoming, 3);
  assert.equal(list[0].orders.length, 3);

  // Cancelled after Friday's cutoff: Friday is already being cooked and stays, the rest are released.
  const out = await lib.cancelSubscription("u1", sub.id, new Date("2026-11-19T18:30:00Z"));
  assert.deepEqual(JSON.parse(JSON.stringify(out)), { cancelled: 2, kept: 1 });
  assert.equal((await lib.getMeal("m_freekeh", SAT)).left, 5);
  assert.equal((await lib.getMeal("m_freekeh", FRI)).left, 2);
  await pg.close();
});

test("release: an order joins the courier flow 45 minutes before its window, once", async () => {
  const { pg, lib, quote, base } = await setup();
  const [o] = await lib.placeOrder({ ...base, day: FRI, items: [{ mealId: "m_freekeh", qty: 1 }] }, quote, NOW);
  const [later] = await lib.placeOrder({ ...base, day: FRI, window: "14-15", items: [{ mealId: "m_kabsa", qty: 1 }] }, quote, NOW);
  const events = [];
  const hooks = { dispatch: async (id) => { events.push(["dispatch", id]); }, notifyCustomer: (u, ord) => events.push(["notify", u, ord.id]) };

  assert.deepEqual(j(await lib.releaseDueOrders(hooks, new Date("2026-11-20T09:00:00Z"))), [], "12:00 Damascus: too early for the 13-14 window");
  assert.deepEqual(j(await lib.releaseDueOrders(hooks, new Date("2026-11-20T09:16:00Z"))), [o.id]);
  assert.deepEqual(JSON.parse(JSON.stringify(events)), [["notify", "u1", o.id], ["dispatch", o.id]]);
  // (The test's "now" is simulated while the database clock is real, so only inequality is meaningful here.)
  const row = (await pg.query(`SELECT status, placed_at <> created_at AS reset, placed_at FROM orders WHERE id = $1`, [o.id])).rows[0];
  assert.equal(row.status, "searching");
  assert.equal(row.reset, true, "created_at now marks the start of the delivery, placed_at when it was ordered");
  assert.equal(new Date(row.placed_at).toISOString(), NOW.toISOString());
  assert.deepEqual(j(await lib.releaseDueOrders(hooks, new Date("2026-11-20T09:17:00Z"))), [], "never released twice");
  assert.equal((await pg.query(`SELECT status FROM orders WHERE id = $1`, [later.id])).rows[0].status, "scheduled");
  assert.deepEqual(j(await lib.releaseDueOrders(hooks, new Date("2026-11-20T10:20:00Z"))), [later.id]);
  await pg.close();
});

test("after the cutoff each kitchen is told once what to cook", async () => {
  const { pg, lib, quote, base } = await setup();
  await lib.placeOrder({ ...base, day: FRI, items: [{ mealId: "m_freekeh", qty: 2 }, { mealId: "m_kabsa", qty: 1 }] }, quote, NOW);
  await lib.placeOrder({ ...base, userId: "u2", day: FRI, window: "12-13", items: [{ mealId: "m_freekeh", qty: 1 }, { mealId: "m_shish", qty: 1 }] }, quote, NOW);
  const sent = [];
  const send = async (phone, text) => { sent.push({ phone, text }); return true; };

  assert.equal(await lib.sendCutoffSummaries(send, NOW), 0, "ordering still open");
  const after = new Date("2026-11-19T18:05:00Z");
  assert.equal(await lib.sendCutoffSummaries(send, after), 1, "k2 has no phone, so only k1 is messaged");
  assert.equal(sent[0].phone, "+963933333333");
  assert.match(sent[0].text, /فريكة بدجاج × 3/);
  assert.match(sent[0].text, /كبسة دجاج × 1/);
  assert.match(sent[0].text, /2 طلب/);
  assert.equal(await lib.sendCutoffSummaries(send, new Date("2026-11-19T18:06:00Z")), 0, "not repeated");
  assert.equal(sent.length, 1);
  await pg.close();
});

test("admin: portions never drop below what is sold; nutrition only on kitchen meals", async () => {
  const { pg, lib, quote, base } = await setup();
  await lib.placeOrder({ ...base, day: FRI, items: [{ mealId: "m_freekeh", qty: 2 }] }, quote, NOW);
  assert.deepEqual(JSON.parse(JSON.stringify(await lib.setMealDay("m_freekeh", FRI, 1))), { portions: 2, sold: 2 });
  assert.deepEqual(JSON.parse(JSON.stringify(await lib.setMealDay("m_freekeh", FRI, 0))), { portions: 2, sold: 2 }, "cannot remove a day with orders");
  assert.deepEqual(JSON.parse(JSON.stringify(await lib.setMealDay("m_kabsa", SAT, 12))), { portions: 12, sold: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(await lib.setMealDay("m_kabsa", SAT, 0))), { portions: 0, sold: 0 });
  assert.equal((await lib.getMenu(SAT)).some((m) => m.id === "m_kabsa"), false);
  assert.equal(await lib.setMealDay("m_broast", FRI, 5), null, "not a kitchen meal");
  assert.equal(await lib.setMealDay("m_shish", SAT, 5, "k1"), null, "a cook cannot edit another kitchen's meal");

  assert.equal(await lib.updateMealNutrition("m_shish", { section: "healthy", calories: 480, proteinG: 42, carbsG: 35, fatG: 14, tags: ["عالي البروتين", "بلا سكر مضاف"] }), true);
  const m = JSON.parse(JSON.stringify(await lib.getMeal("m_shish", FRI)));
  assert.deepEqual([m.section, m.calories, m.proteinG, m.tags], ["healthy", 480, 42, ["عالي البروتين", "بلا سكر مضاف"]]);
  assert.equal(await lib.updateMealNutrition("m_broast", { calories: 900 }), false);

  assert.equal(await lib.setRestaurantKind("r1", true), true);
  const ov = JSON.parse(JSON.stringify(await lib.adminOverview(NOW)));
  assert.equal(ov.kitchens.length, 3);
  assert.equal(ov.upcoming[0].orders, 1);
  const cancelled = await lib.adminCancelScheduled((await pg.query(`SELECT id FROM orders LIMIT 1`)).rows[0].id);
  assert.equal(cancelled.status, "cancelled");
  assert.equal((await lib.getMeal("m_freekeh", FRI)).left, 2, "admin cancel also returns portions");
  await pg.close();
});
