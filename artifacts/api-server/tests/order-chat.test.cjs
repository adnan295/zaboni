const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");

function load(mocks) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib/orderChat.ts"), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const c = { exports: {}, require: (id) => { if (!(id in mocks)) throw new Error("Unmocked import " + id); return mocks[id]; },
    Date, Math, Number, String, Map, Set, Array, Promise, Error, JSON, Boolean, Object, RegExp };
  vm.runInNewContext(js, c);
  return c.exports;
}

async function setup(status = "on_way") {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE orders (id TEXT PRIMARY KEY, user_id TEXT, courier_id TEXT, status TEXT);
    INSERT INTO orders VALUES ('o1', 'sara', 'hashem', '${status}'), ('o2', 'sara', NULL, 'searching');
  `);
  const pool = { query: (sql, args) => (args ? pg.query(sql, args) : pg.exec(sql).then((r) => r[r.length - 1] ?? { rows: [] })) };
  const lib = load({ "@workspace/db": { pool }, "node:crypto": crypto });
  await lib.ensureOrderChatSchema();
  return { pg, lib };
}

const code = async (p) => { try { await p; return "ok"; } catch (e) { return e.code ?? e.message; } };

test("customer and courier chat; each sees the other's messages as unread until they open the chat", async () => {
  const { pg, lib } = await setup();
  await lib.sendText("o1", "hashem", "وصلت عالحمرا بس مو لاقي البناية");
  await lib.sendText("o1", "sara", "هلق ببعتلك الموقع");
  const mine = await lib.listMessages("o1", "sara");
  assert.equal(mine.role, "customer");
  assert.equal(mine.open, true);
  assert.equal(mine.unread, 1);
  assert.deepEqual(mine.messages.map((m) => m.from), ["courier", "customer"]);
  await lib.markRead("o1", "sara");
  assert.equal((await lib.listMessages("o1", "sara")).unread, 0);
  assert.equal((await lib.listMessages("o1", "hashem")).unread, 1, "the courier has not read the reply yet");
  await pg.close();
});

test("phone numbers never get through, whatever way they are written", async () => {
  const { lib } = await setup();
  for (const raw of ["رقمي 0994123456", "+963 994 123 456", "٠٩٩٤١٢٣٤٥٦ كلمني", "09-94-12-34-56", "00963994123456"]) {
    const { message } = await lib.sendText("o1", "hashem", raw);
    assert.equal(message.masked, true, raw);
    assert.doesNotMatch(message.text, /[0-9٠-٩]{3}/, raw);
  }
  const { message } = await lib.sendText("o1", "sara", "بدّلوا الكولا بعصير، وبدي 2 سندويش");
  assert.equal(message.masked, false);
  assert.equal(message.text, "بدّلوا الكولا بعصير، وبدي 2 سندويش");
});

test("only the customer sends a location, and the courier's WhatsApp text has no customer number", async () => {
  const { lib } = await setup();
  const { message } = await lib.sendLocation("o1", "sara", 34.7301, 36.7102, 8.4);
  assert.equal(message.kind, "location");
  assert.equal(message.accuracy, 8);
  assert.equal(await code(lib.sendLocation("o1", "hashem", 34.73, 36.71, 5)), "customer_only");
  assert.equal(await code(lib.sendLocation("o1", "sara", 0, 0, 5)), "bad_location");
  const text = lib.locationWhatsappText({ orderId: "order_abc123", placeName: "بروستد مشيعل", address: "الحمرا، جانب الحديقة", lat: 34.7301, lon: 36.7102, accuracy: 8 });
  assert.match(text, /#abc123/);
  assert.match(text, /destination=34\.730100,36\.710200/);
  assert.doesNotMatch(text, /09\d{8}|\+963/);
});

test("strangers, orders with no courier yet, and finished orders", async () => {
  const { pg, lib } = await setup();
  assert.equal(await code(lib.listMessages("o1", "rami")), "not_your_order");
  assert.equal(await code(lib.sendText("o2", "sara", "مرحبا")), "no_courier_yet");
  assert.equal(await code(lib.listMessages("nope", "sara")), "order_not_found");
  await lib.sendText("o1", "sara", "مرحبا");
  await pg.query(`UPDATE orders SET status = 'delivered' WHERE id = 'o1'`);
  const after = await lib.listMessages("o1", "sara");
  assert.equal(after.open, false);
  assert.equal(after.messages.length, 1, "kept, read-only");
  assert.equal(await code(lib.sendText("o1", "sara", "شكراً")), "chat_closed");
  await pg.close();
});

test("empty, too long, and flooding are refused", async () => {
  const { lib } = await setup();
  assert.equal(await code(lib.sendText("o1", "sara", "   ")), "empty_message");
  assert.equal(await code(lib.sendText("o1", "sara", "ا".repeat(501))), "message_too_long");
  const now = new Date();
  for (let i = 0; i < lib.MAX_PER_MINUTE; i++) await lib.sendText("o1", "sara", `رسالة ${i}`, now);
  assert.equal(await code(lib.sendText("o1", "sara", "وكمان", now)), "too_many_messages");
  assert.equal(await code(lib.sendText("o1", "hashem", "تمام", now)), "ok", "the other side is not affected");
});
