const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");

const j = (v) => JSON.parse(JSON.stringify(v));

function load(mocks) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib/stamps.ts"), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const c = { exports: {}, require: (id) => { if (!(id in mocks)) throw new Error("Unmocked import " + id); return mocks[id]; },
    Date, Math, Number, String, Map, Set, Array, Promise, Error, JSON, Boolean, Object };
  vm.runInNewContext(js, c);
  return c.exports;
}

async function setup() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, role TEXT NOT NULL DEFAULT 'customer');
    CREATE TABLE restaurants (id TEXT PRIMARY KEY, name_ar TEXT);
    CREATE TABLE menu_items (id TEXT PRIMARY KEY, restaurant_id TEXT, name_ar TEXT, price INTEGER, category_ar TEXT DEFAULT '');
    CREATE TABLE orders (id TEXT PRIMARY KEY, user_id TEXT, restaurant_id TEXT, restaurant_name TEXT, status TEXT,
                         order_type TEXT NOT NULL DEFAULT 'restaurant', total_price INTEGER);
    INSERT INTO users VALUES ('sara', 'customer'), ('rami', 'customer'), ('abu', 'courier');
    INSERT INTO restaurants VALUES ('mech', 'بروستد مشيعل'), ('otac', 'أوتاكوس');
    INSERT INTO menu_items VALUES ('shaw', 'mech', 'سندويشة شاورما', 350, ''), ('taco', 'otac', 'وجبة تاكو', 300, '');
  `);
  const pool = { query: (sql, args) => (args ? pg.query(sql, args) : pg.exec(sql).then((r) => r[r.length - 1] ?? { rows: [] })) };
  const lib = load({ "@workspace/db": { pool }, "node:crypto": crypto });
  let n = 0;
  const deliver = async (user, rest, total, at) => {
    const id = `o${++n}`;
    await pg.query(`INSERT INTO orders VALUES ($1, $2, $3, $4, 'delivered', 'restaurant', $5)`, [id, user, rest, rest === "mech" ? "بروستد مشيعل" : "أوتاكوس", total]);
    return { id, award: await lib.awardStampForOrder(id, at) };
  };
  return { pg, lib, deliver };
}

const day = (d, h = 12) => new Date(Date.UTC(2026, 10, d, h - 3)); // local Homs time

const program = (over = {}) => ({
  restaurantId: "mech", enabled: true, goal: 5, minOrder: 300, rewardType: "amount", rewardAmount: 5000,
  rewardItemId: null, rewardItemName: null, couponDays: 30, monthlyCap: null, ...over,
});

test("five delivered orders on five days fill the card and turn it into a coupon", async () => {
  const { pg, lib, deliver } = await setup();
  await lib.upsertProgram(program());
  for (let d = 1; d <= 4; d++) {
    const { award } = await deliver("sara", "mech", 400, day(d));
    assert.equal(award.stamps, d);
    assert.equal(award.coupon, null);
  }
  const { award } = await deliver("sara", "mech", 400, day(5));
  assert.equal(award.stamps, 5);
  assert.ok(award.coupon, "a coupon on the fifth stamp");
  assert.equal(award.reward, "خصم 5,000 ل.س");
  const mine = j(await lib.myStamps("sara", day(5, 13)));
  assert.equal(mine.cards.length, 0, "the card starts again from zero");
  assert.equal(mine.coupons.length, 1);
  assert.equal(mine.coupons[0].restaurantName, "بروستد مشيعل");
  await pg.close();
});

test("no stamp: below the minimum, a second order the same day, errands, couriers, or no programme", async () => {
  const { pg, lib, deliver } = await setup();
  await lib.upsertProgram(program());
  assert.equal((await deliver("sara", "mech", 250, day(1))).award, null, "under the minimum");
  assert.equal((await deliver("sara", "mech", 400, day(1, 10))).award.stamps, 1);
  assert.equal((await deliver("sara", "mech", 900, day(1, 20))).award, null, "same Homs day");
  assert.equal((await deliver("sara", "mech", 400, day(2, 1))).award.stamps, 2, "after midnight Homs time is a new day");
  assert.equal((await deliver("abu", "mech", 400, day(3))).award, null, "a courier's own order");
  assert.equal((await deliver("sara", "otac", 400, day(3))).award, null, "restaurant not in the programme");
  await pg.query(`INSERT INTO orders VALUES ('err', 'sara', 'mech', '', 'delivered', 'errand', 999)`);
  assert.equal(await lib.awardStampForOrder("err", day(4)), null, "free errand order");
  await pg.query(`INSERT INTO orders VALUES ('canc', 'sara', 'mech', '', 'cancelled', 'restaurant', 999)`);
  assert.equal(await lib.awardStampForOrder("canc", day(5)), null, "cancelled order");
  const { id } = await deliver("sara", "mech", 400, day(6));
  assert.equal(await lib.awardStampForOrder(id, day(7)), null, "the same order never stamps twice");
  await lib.upsertProgram(program({ enabled: false }));
  assert.equal((await deliver("sara", "mech", 400, day(8))).award, null, "programme switched off");
  await pg.close();
});

test("stamps older than 90 days are wiped", async () => {
  const { pg, lib, deliver } = await setup();
  await lib.upsertProgram(program());
  await deliver("sara", "mech", 400, new Date(Date.UTC(2026, 0, 1)));
  await deliver("sara", "mech", 400, new Date(Date.UTC(2026, 0, 2)));
  const late = await deliver("sara", "mech", 400, day(20));
  assert.equal(late.award.stamps, 1, "starts again after a long break");
  await pg.close();
});

test("a free-dish coupon pays for one of that dish, only at that restaurant", async () => {
  const { pg, lib, deliver } = await setup();
  await lib.upsertProgram(program({ goal: 2, rewardType: "item", rewardItemId: "shaw", rewardAmount: 0 }));
  await deliver("sara", "mech", 400, day(1));
  const { award } = await deliver("sara", "mech", 400, day(2));
  assert.equal(award.reward, "سندويشة شاورما ببلاش");
  const coupon = j(await lib.couponForCheckout("sara", "mech", day(3)));
  assert.equal(coupon.rewardItemId, "shaw");
  assert.equal(await lib.couponForCheckout("sara", "otac", day(3)), null);

  await assert.rejects(lib.claimCoupon({ userId: "sara", couponId: coupon.id, restaurantId: "otac", orderId: "x1", items: [], itemsTotal: 900, now: day(3) }),
    /بينصرف بس عند المطعم/);
  await assert.rejects(lib.claimCoupon({ userId: "sara", couponId: coupon.id, restaurantId: "mech", orderId: "x2", items: [{ menuItemId: "other", unitPrice: 200 }], itemsTotal: 200, now: day(3) }),
    /زيد «سندويشة شاورما»/);
  await assert.rejects(lib.claimCoupon({ userId: "rami", couponId: coupon.id, restaurantId: "mech", orderId: "x3", items: [], itemsTotal: 900, now: day(3) }),
    /مو متاح/, "someone else's coupon");

  const ok = await lib.claimCoupon({ userId: "sara", couponId: coupon.id, restaurantId: "mech", orderId: "o-new",
    items: [{ menuItemId: "shaw", unitPrice: 350 }, { menuItemId: "shaw", unitPrice: 350 }], itemsTotal: 700, now: day(3) });
  assert.equal(ok.discount, 350, "one sandwich, not two");
  assert.match(ok.note, /مخصوم 350 ل\.س من الفاتورة/);
  await assert.rejects(lib.claimCoupon({ userId: "sara", couponId: coupon.id, restaurantId: "mech", orderId: "o-again", items: [{ menuItemId: "shaw", unitPrice: 350 }], itemsTotal: 350, now: day(3) }),
    /مو متاح/, "a used coupon cannot be used again");
  await pg.close();
});

test("an amount coupon never exceeds the food; a cancelled order gives the coupon back", async () => {
  const { pg, lib, deliver } = await setup();
  await lib.upsertProgram(program({ goal: 2 }));
  await deliver("sara", "mech", 400, day(1));
  await deliver("sara", "mech", 400, day(2));
  const coupon = await lib.couponForCheckout("sara", "mech", day(3));
  const claimed = await lib.claimCoupon({ userId: "sara", couponId: coupon.id, restaurantId: "mech", orderId: "small", items: [], itemsTotal: 1200, now: day(3) });
  assert.equal(claimed.discount, 1200, "capped at the food total");
  assert.equal(await lib.couponForCheckout("sara", "mech", day(3)), null, "held by the order");
  await pg.query(`INSERT INTO orders VALUES ('small', 'sara', 'mech', '', 'cancelled', 'restaurant', 0)`);
  assert.ok(await lib.couponForCheckout("sara", "mech", day(3)), "back after the order was cancelled");
  await pg.close();
});

test("coupons expire, and the monthly cap holds a full card until next month", async () => {
  const { pg, lib, deliver } = await setup();
  await lib.upsertProgram(program({ goal: 2, couponDays: 10, monthlyCap: 1 }));
  await deliver("sara", "mech", 400, day(1));
  assert.ok((await deliver("sara", "mech", 400, day(2))).award.coupon);
  assert.equal(await lib.couponForCheckout("sara", "mech", day(20)), null, "expired after 10 days");

  await deliver("rami", "mech", 400, day(3));
  const capped = (await deliver("rami", "mech", 400, day(4))).award;
  assert.equal(capped.coupon, null, "this month's budget is spent");
  assert.equal(capped.stamps, 2, "card stays full");
  const december = (await deliver("rami", "mech", 400, new Date(Date.UTC(2026, 11, 2)))).award;
  assert.ok(december.coupon, "pays out once the month turns");

  const admin = j(await lib.adminPrograms(new Date(Date.UTC(2026, 11, 3))));
  const mech = admin.find((r) => r.restaurantId === "mech");
  assert.equal(mech.stats.couponsIssued, 2);
  assert.equal(mech.stats.couponsThisMonth, 1);
  assert.equal(mech.stats.stampedOrders, 5);
  assert.equal(admin.find((r) => r.restaurantId === "otac").program, null);
  await pg.close();
});

test("admin terms are checked", async () => {
  const { pg, lib } = await setup();
  await assert.rejects(lib.upsertProgram(program({ goal: 1 })), /بين 2 و 20/);
  await assert.rejects(lib.upsertProgram(program({ rewardAmount: 0 })), /مبلغ/);
  await assert.rejects(lib.upsertProgram(program({ rewardType: "item", rewardItemId: "taco" })), /مو من منيو/);
  const saved = await lib.upsertProgram(program({ rewardType: "item", rewardItemId: "shaw" }));
  assert.equal(saved.rewardItemName, "سندويشة شاورما");
  assert.deepEqual(j(await lib.listEnabledPrograms()), [{ restaurantId: "mech", goal: 5, reward: "سندويشة شاورما ببلاش" }]);
  await pg.close();
});
