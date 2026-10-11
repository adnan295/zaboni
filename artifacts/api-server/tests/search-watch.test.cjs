const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");
const root = path.resolve(__dirname, "../../..");
const noop = () => {};
const logger = { info: noop, warn: noop, error: noop, debug: noop };

function load(file, mocks) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const c = {
    exports: {},
    require: (id) => {
      if (!(id in mocks)) throw new Error("Unmocked import " + id);
      return mocks[id];
    },
    process: { env: {} },
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => ({ unref: noop }),
    clearInterval,
    Error,
    Date,
    Buffer,
  };
  vm.runInNewContext(js, c, { filename: file });
  return c.exports;
}

// Real PostgreSQL SQL in an isolated, in-memory PGlite database. WhatsApp and
// push are recorders — no phones, tokens or network are involved.
async function setup() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, phone TEXT UNIQUE, name TEXT DEFAULT '',
      role TEXT DEFAULT 'customer', is_online BOOLEAN DEFAULT true, is_blocked BOOLEAN DEFAULT false);
    CREATE TABLE orders (id TEXT PRIMARY KEY, user_id TEXT, status TEXT NOT NULL, courier_id TEXT DEFAULT '',
      order_type TEXT DEFAULT 'restaurant', restaurant_id TEXT, restaurant_name TEXT DEFAULT '', place_name TEXT,
      order_text TEXT DEFAULT '', delivery_fee INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE order_status_history (id TEXT PRIMARY KEY, order_id TEXT, status TEXT, note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE promo_codes (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, type TEXT, value REAL,
      max_uses INTEGER, max_uses_per_user INTEGER, expires_at TIMESTAMPTZ, is_active BOOLEAN,
      applies_to TEXT, audience TEXT, auto_apply BOOLEAN, title_ar TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE promo_targets (id TEXT PRIMARY KEY, promo_id TEXT, phone TEXT);
    CREATE TABLE promo_uses (id TEXT PRIMARY KEY, promo_id TEXT);
    CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW());
  `);
  const run = async (sql, args) => {
    if (sql.includes("CREATE TABLE") || sql.includes("ALTER TABLE")) {
      await pg.exec(sql);
      return { rows: [], rowCount: 0 };
    }
    const r = await pg.query(sql, args);
    return { ...r, rowCount: r.affectedRows ?? r.rows.length };
  };
  const pool = { query: run, connect: async () => ({ query: run, release: noop }) };
  const sent = { push: [], whatsapp: [] };
  const mocks = {
    "node:crypto": require("node:crypto"),
    "@workspace/db": { pool },
    "./logger": { logger },
    "./push": { sendPushToUsers: async (ids, title, body, data) => sent.push.push({ ids, title, body, data }) },
    "./whatsapp": { whatsappManager: { sendMessage: async (phone, text) => (sent.whatsapp.push({ phone, text }), true) } },
  };
  const dispatch = load("artifacts/api-server/src/lib/orderDispatch.ts", {
    "node:crypto": require("node:crypto"),
    "@workspace/db": { pool },
    "./logger": { logger },
  });
  await dispatch.ensureDispatchSchema();
  const w = load("artifacts/api-server/src/lib/searchWatch.ts", mocks);
  return { pg, w, sent };
}

const minsAgo = (m) => new Date(Date.now() - m * 60000);

test("apology promo: issued once after a long courier search, gated against abuse", async (t) => {
  const { pg, w, sent } = await setup();
  await pg.exec(`INSERT INTO users(id, phone, name) VALUES
    ('u1','+963911111111','Ali Hassan'), ('fake','+963922222222',''), ('u3','+963933333333','Sara')`);
  await pg.exec(`INSERT INTO orders(id,user_id,status) VALUES ('old','u1','delivered')`);

  await t.test("customer who waited past the threshold gets one free-delivery promo", async () => {
    await pg.query("INSERT INTO orders(id,user_id,status,created_at) VALUES('o1','u1','cancelled',$1)", [minsAgo(5)]);
    assert.equal(await w.maybeIssueApologyPromo("u1", "o1", minsAgo(5)), "issued");
    const { rows } = await pg.query(
      "SELECT p.*, t.phone FROM promo_codes p JOIN promo_targets t ON t.promo_id = p.id",
    );
    assert.equal(rows.length, 1);
    const p = rows[0];
    assert.match(p.code, /^SORRY-[0-9A-F]{8}$/);
    assert.equal(p.type, "percent");
    assert.equal(p.value, 100);
    assert.equal(p.applies_to, "delivery");
    assert.equal(p.audience, "specific");
    assert.equal(p.auto_apply, true);
    assert.equal(p.max_uses, 1);
    assert.equal(p.phone, "+963911111111");
    const days = (new Date(p.expires_at) - Date.now()) / 86400000;
    assert.ok(days > 6.9 && days <= 7, "valid for 7 days");
    assert.equal(sent.whatsapp.length, 1);
    assert.equal(sent.whatsapp[0].phone, "+963911111111");
    assert.match(sent.whatsapp[0].text, /أهلين Ali/);
    assert.equal(sent.push.length, 1);
  });

  await t.test("a second give-up within 30 days gets nothing (no farming)", async () => {
    await pg.query("INSERT INTO orders(id,user_id,status,created_at) VALUES('o2','u1','cancelled',$1)", [minsAgo(8)]);
    assert.equal(await w.maybeIssueApologyPromo("u1", "o2", minsAgo(8)), "cooldown");
    assert.equal((await pg.query("SELECT COUNT(*)::int AS c FROM promo_codes")).rows[0].c, 1);
  });

  await t.test("short waits and orders a courier had accepted are skipped", async () => {
    assert.equal(await w.maybeIssueApologyPromo("u3", "o3", minsAgo(1)), "short_wait");
    await pg.query("INSERT INTO orders(id,user_id,status,created_at) VALUES('o4','u3','cancelled',$1)", [minsAgo(9)]);
    await pg.exec("INSERT INTO order_status_history(id,order_id,status) VALUES('h4','o4','accepted')");
    assert.equal(await w.maybeIssueApologyPromo("u3", "o4", minsAgo(9)), "courier_found");
  });

  await t.test("never-served accounts that keep cancelling are treated as suspect", async () => {
    await pg.exec(`INSERT INTO orders(id,user_id,status) VALUES
      ('f1','fake','cancelled'),('f2','fake','cancelled'),('f3','fake','cancelled')`);
    assert.equal(await w.maybeIssueApologyPromo("fake", "f3", minsAgo(10)), "suspect_account");
  });

  await t.test("admin can switch it off", async () => {
    await w.saveWaitSettings({ searchAlertMinutes: 3, nudgeEnabled: true, apologyEnabled: false });
    await pg.query("INSERT INTO orders(id,user_id,status,created_at) VALUES('o5','u3','cancelled',$1)", [minsAgo(6)]);
    assert.equal(await w.maybeIssueApologyPromo("u3", "o5", minsAgo(6)), "disabled");
  });

  await t.test("stats count issued apologies", async () => {
    assert.deepEqual({ ...(await w.getApologyStats(30)) }, { issued: 1, used: 0 });
  });
});

test("waiting customers are reassured once, and stuck orders reach the admin", async (t) => {
  const { pg, w, sent } = await setup();
  await pg.exec(`INSERT INTO users(id, phone, name, role, is_online) VALUES
    ('c1','+963944444444','Omar','customer',true),
    ('k1','+963955555555','Courier Free','courier',true),
    ('k2','+963966666666','Courier Busy','courier',true),
    ('k3','+963977777777','Courier Off','courier',false)`);
  await pg.query(
    `INSERT INTO orders(id,user_id,status,created_at,restaurant_name) VALUES
     ('slow','c1','searching',$1,'Lets Shawarma'), ('fresh','c1','searching',$2,'OTACOS')`,
    [minsAgo(4), minsAgo(1)],
  );
  await pg.exec(`INSERT INTO orders(id,user_id,status,courier_id) VALUES ('busy','c1','accepted','k2')`);
  await pg.exec(`INSERT INTO order_dispatch(order_id, max_eligible, max_accepted, last_error)
    VALUES ('slow', 2, 3, NULL), ('fresh', 0, 0, 'no_reachable_couriers')`);

  await t.test("only orders past the threshold are nudged, exactly once", async () => {
    await w.runCustomerNudges();
    assert.equal(sent.push.length, 1);
    assert.deepEqual(Array.from(sent.push[0].ids), ["c1"]);
    assert.equal(sent.push[0].data.orderId, "slow");
    assert.equal(sent.push[0].data.type, "order_update");
    await w.runCustomerNudges();
    assert.equal(sent.push.length, 1, "no duplicate reassurance");
  });

  await t.test("nudges respect the admin switch", async () => {
    await w.saveWaitSettings({ searchAlertMinutes: 3, nudgeEnabled: false, apologyEnabled: true });
    await pg.query("UPDATE orders SET created_at = $1 WHERE id = 'fresh'", [minsAgo(5)]);
    await w.runCustomerNudges();
    assert.equal(sent.push.length, 1);
    await w.saveWaitSettings({ searchAlertMinutes: 3, nudgeEnabled: true, apologyEnabled: true });
    await pg.query("UPDATE orders SET created_at = $1 WHERE id = 'fresh'", [minsAgo(1)]);
  });

  await t.test("stuck list has the waiting order, why it waits, and courier capacity now", async () => {
    const r = await w.getStuckOrders(3);
    assert.equal(r.orders.length, 1);
    const o = r.orders[0];
    assert.equal(o.id, "slow");
    assert.ok(o.waitMinutes >= 4);
    assert.equal(o.customerName, "Omar");
    assert.equal(o.summary, "Lets Shawarma");
    assert.equal(o.maxEligible, 2);
    assert.equal(o.maxAccepted, 3);
    assert.equal(o.nudged, true);
    // k1 free, k2 has an order awaiting pickup (not free), k3 offline (not counted).
    assert.deepEqual({ ...r.couriers }, { online: 2, free: 1 });
  });

  await t.test("settings round-trip with sane defaults", async () => {
    await pg.exec("DELETE FROM system_settings");
    assert.deepEqual({ ...(await w.getWaitSettings()) }, { searchAlertMinutes: 3, nudgeEnabled: true, apologyEnabled: true });
    await w.saveWaitSettings({ searchAlertMinutes: 5, nudgeEnabled: false, apologyEnabled: true });
    assert.deepEqual({ ...(await w.getWaitSettings()) }, { searchAlertMinutes: 5, nudgeEnabled: false, apologyEnabled: true });
  });
});
