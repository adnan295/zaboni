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
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib/callBridge.ts"), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const c = { exports: {}, require: (id) => { if (!(id in mocks)) throw new Error("Unmocked import " + id); return mocks[id]; },
    Date, Math, Number, String, Map, Set, Array, Promise, Error, JSON, Boolean, setInterval, clearInterval };
  vm.runInNewContext(js, c);
  return c.exports;
}

async function setup() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, phone TEXT UNIQUE, role TEXT);
    CREATE TABLE orders (id TEXT PRIMARY KEY, user_id TEXT, courier_id TEXT NOT NULL DEFAULT '', courier_phone TEXT NOT NULL DEFAULT '',
                         status TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    INSERT INTO users VALUES ('cust', 'سارة', '+963933111111', 'customer'), ('cour', 'أبو أحمد', '+963944222222', 'courier'),
                             ('cust2', 'رامي', '+963955333333', 'customer');
  `);
  const pool = { query: (sql, args) => (args ? pg.query(sql, args) : pg.exec(sql).then((r) => r[r.length - 1] ?? { rows: [] })) };
  return { pg, lib: load({ "@workspace/db": { pool }, "node:crypto": crypto }) };
}

test("phone numbers match however they are written", async () => {
  const { lib } = await setup();
  for (const p of ["+963933111111", "00963933111111", "0933111111", "933111111", "+963 933 111 111"]) {
    assert.equal(lib.normalizePhone(p), "933111111", p);
  }
  assert.equal(lib.localDialForm("+963933111111"), "0933111111");
  assert.equal(lib.localDialForm("0933111111"), "0933111111");
  assert.equal(lib.localDialForm("+905321234567"), "+905321234567", "a foreign number keeps its country code");
});

test("a courier calling the company number reaches the customer of his order in progress", async () => {
  const { pg, lib } = await setup();
  const { id: lineId } = await lib.createLine({ phone: "0999000001" });
  await pg.exec(`INSERT INTO orders VALUES ('o1', 'cust', 'cour', '+963944222222', 'picked_up', NOW())`);
  // Caller ID as the SIM shows it: local form.
  const r = await lib.routeIncomingCall(lineId, "0944222222");
  assert.equal(r.dial, "0933111111");
  assert.equal(r.orderId, "o1");
  assert.equal(r.callerRole, "courier");

  // …and the customer calling reaches the courier.
  const back = await lib.routeIncomingCall(lineId, "+963933111111");
  assert.equal(back.dial, "0944222222");
  assert.equal(back.callerRole, "customer");
  await pg.close();
});

test("strangers and people with no order in progress are not put through", async () => {
  const { pg, lib } = await setup();
  const { id: lineId } = await lib.createLine({ phone: "0999000001" });
  assert.equal((await lib.routeIncomingCall(lineId, "0911000000")).reason, "unknown_caller");
  assert.equal((await lib.routeIncomingCall(lineId, "")).reason, "unknown_caller", "hidden caller ID");
  assert.equal((await lib.routeIncomingCall(lineId, "0933111111")).reason, "no_active_order");
  await pg.exec(`INSERT INTO orders VALUES ('old', 'cust', 'cour', '', 'delivered', NOW() - INTERVAL '2 hours'),
                                          ('can', 'cust', 'cour', '', 'cancelled', NOW())`);
  assert.equal((await lib.routeIncomingCall(lineId, "0944222222")).reason, "no_active_order", "long delivered / cancelled");
  // Just delivered: still reachable for a forgotten item.
  await pg.exec(`INSERT INTO orders VALUES ('just', 'cust', 'cour', '', 'delivered', NOW() - INTERVAL '5 minutes')`);
  assert.equal((await lib.routeIncomingCall(lineId, "0944222222")).orderId, "just");
  const log = j(await lib.listCalls());
  assert.equal(log.filter((c) => c.status === "rejected").length, 4, "every attempt is logged");
  await pg.close();
});

test("a courier carrying two orders reaches the customer he chose in the app", async () => {
  const { pg, lib } = await setup();
  const { id: lineId } = await lib.createLine({ phone: "0999000001" });
  await pg.exec(`INSERT INTO orders VALUES ('a', 'cust', 'cour', '', 'on_way', NOW() - INTERVAL '1 minute'),
                                          ('b', 'cust2', 'cour', '', 'accepted', NOW())`);
  assert.equal((await lib.routeIncomingCall(lineId, "0944222222")).orderId, "b", "newest order by default");
  await lib.recordCallIntent("cour", "a");
  const r = await lib.routeIncomingCall(lineId, "0944222222");
  assert.equal(r.orderId, "a");
  assert.equal(r.dial, "0933111111");
  await pg.close();
});

test("call log: connected calls get a talk time, unanswered ones are failures", async () => {
  const { pg, lib } = await setup();
  const { id: lineId } = await lib.createLine({ phone: "0999000001" });
  const other = await lib.createLine({ phone: "0999000002" });
  await pg.exec(`INSERT INTO orders VALUES ('o1', 'cust', 'cour', '', 'on_way', NOW())`);
  const ok = await lib.routeIncomingCall(lineId, "0944222222");
  assert.equal(await lib.recordCallEvent(other.id, ok.callId, "merged"), false, "another line cannot touch this call");
  assert.equal(await lib.recordCallEvent(lineId, ok.callId, "merged"), true);
  await pg.query(`UPDATE call_bridge_calls SET merged_at = NOW() - INTERVAL '75 seconds' WHERE id = $1`, [ok.callId]);
  await lib.recordCallEvent(lineId, ok.callId, "ended");
  const missed = await lib.routeIncomingCall(lineId, "0933111111");
  await lib.recordCallEvent(lineId, missed.callId, "ended", "no_answer");
  const log = j(await lib.listCalls());
  const a = log.find((c) => c.id === ok.callId);
  assert.equal(a.status, "ended");
  assert.ok(a.talkSeconds >= 74 && a.talkSeconds <= 77, String(a.talkSeconds));
  assert.equal(a.callerName, "أبو أحمد");
  assert.equal(a.targetName, "سارة");
  const b = log.find((c) => c.id === missed.callId);
  assert.equal(b.status, "failed");
  assert.equal(b.reason, "no_answer");
  await pg.close();
});

test("numbers are hidden only while the switch is on and a line is online", async () => {
  const { pg, lib } = await setup();
  const order = { id: "o1", status: "on_way", courierPhone: "+963944222222" };
  const { id, token } = await lib.createLine({ phone: "+963999000001" });
  await lib.refreshBridgeState();
  assert.equal(lib.publicLineNumber("o1"), null, "switch off");

  await lib.setBridgeEnabled(true);
  assert.equal(lib.maskingActive(), false, "switch on, but the line phone never checked in");
  assert.deepEqual(j(lib.maskCourierPhone(order)), order, "real number kept so the customer can still call");

  const line = await lib.lineByToken(token);
  assert.equal(line.id, id);
  assert.equal(await lib.lineByToken("wrong"), null);
  await lib.heartbeat(id);
  assert.equal(lib.maskingActive(), true);
  assert.equal(lib.publicLineNumber("o1"), "0999000001");
  assert.deepEqual(j(lib.maskCourierPhone(order)), { ...order, courierPhone: "0999000001", phoneMasked: true });
  assert.equal(lib.maskCourierPhone({ ...order, status: "cancelled" }).courierPhone, "", "nothing left in old history");

  // The line loses power: after the window it no longer counts, numbers come back.
  await pg.query(`UPDATE call_bridge_lines SET last_seen_at = NOW() - INTERVAL '5 minutes'`);
  await lib.refreshBridgeState();
  assert.equal(lib.publicLineNumber("o1"), null);

  // A disabled line is refused outright.
  await lib.heartbeat(id);
  await lib.setLineEnabled(id, false);
  assert.equal(await lib.lineByToken(token), null);
  assert.equal(lib.maskingActive(), false);
  await pg.close();
});

test("orders are spread across lines, and each order always shows the same one", async () => {
  const { pg, lib } = await setup();
  for (const p of ["0999000001", "0999000002", "0999000003"]) {
    const { id } = await lib.createLine({ phone: p });
    await lib.heartbeat(id);
  }
  await lib.setBridgeEnabled(true);
  const seen = new Set();
  for (let i = 0; i < 30; i++) seen.add(lib.publicLineNumber("order_" + i));
  assert.equal(seen.size, 3);
  assert.equal(lib.publicLineNumber("order_7"), lib.publicLineNumber("order_7"));
  await assert.rejects(lib.createLine({ phone: "123" }));
  await pg.close();
});
