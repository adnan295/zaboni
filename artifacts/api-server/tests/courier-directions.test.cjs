const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");

function load(mocks) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib/courierDirections.ts"), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const c = { exports: {}, require: (id) => { if (!(id in mocks)) throw new Error("Unmocked import " + id); return mocks[id]; }, Number, String };
  vm.runInNewContext(js, c);
  return c.exports;
}

async function setup() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, phone TEXT);
    CREATE TABLE restaurants (id TEXT PRIMARY KEY, lat REAL, lon REAL, phone TEXT);
    CREATE TABLE orders (id TEXT PRIMARY KEY, user_id TEXT, courier_id TEXT, restaurant_id TEXT, restaurant_name TEXT, restaurant_phone TEXT,
      place_name TEXT, order_text TEXT, address TEXT, destination_lat DOUBLE PRECISION, destination_lon DOUBLE PRECISION);
    INSERT INTO users VALUES ('cust','خضر','+963911111111'),('cour','حسين','+963922222222');
    INSERT INTO restaurants VALUES ('r1', 34.745945, 36.687397, '0984037151'), ('r_nopin', NULL, NULL, '');
    INSERT INTO orders VALUES
      ('order_abc123','cust','cour','r1','صاجيات وكعك طحان','0984037151',NULL,'شلل × 2','الحمرا، جانب الصيدلية',34.7301,36.7092),
      ('order_nopin1','cust','cour','r_nopin','مطعم بلا موقع','',NULL,'وجبة','الحمرا',34.7301,36.7092),
      ('order_nocour','cust','','r1','صاجيات وكعك طحان','',NULL,'وجبة','الحمرا',34.7301,36.7092);
  `);
  const sent = [];
  const lib = load({
    "@workspace/db": { pool: { query: (sql, args) => pg.query(sql, args) } },
    "./logger": { logger: { warn() {} } },
    "./whatsapp": { whatsappManager: { sendMessage: async (phone, text) => { sent.push({ phone, text }); return true; } } },
  });
  return { pg, lib, sent };
}

test("accepting sends the restaurant's map link; collecting sends the customer's", async () => {
  const { pg, lib, sent } = await setup();

  assert.equal(await lib.sendCourierDirections("order_abc123", "to_restaurant"), true);
  assert.equal(sent[0].phone, "+963922222222", "goes to the courier, not the customer");
  assert.match(sent[0].text, /صاجيات وكعك طحان/);
  assert.ok(sent[0].text.includes("https://www.google.com/maps/dir/?api=1&destination=34.745945,36.687397"));
  assert.ok(sent[0].text.includes("https://maps.apple.com/?daddr=34.745945,36.687397"));
  assert.ok(!sent[0].text.includes("34.730100"), "the customer's location is not revealed before pickup");
  assert.ok(!sent[0].text.includes("+963911111111"));

  assert.equal(await lib.sendCourierDirections("order_abc123", "to_customer"), true);
  assert.ok(sent[1].text.includes("destination=34.730100,36.709200"));
  assert.match(sent[1].text, /خضر/);
  assert.match(sent[1].text, /الحمرا، جانب الصيدلية/);
  await pg.close();
});

test("nothing is sent without a pin, without a courier, or when the admin switches it off", async () => {
  const { pg, lib, sent } = await setup();
  assert.equal(await lib.sendCourierDirections("order_nopin1", "to_restaurant"), false, "restaurant has no pin");
  assert.equal(await lib.sendCourierDirections("order_nopin1", "to_customer"), true, "customer pin still works");
  assert.equal(await lib.sendCourierDirections("order_nocour", "to_restaurant"), false);
  assert.equal(await lib.sendCourierDirections("missing", "to_restaurant"), false);
  assert.equal(sent.length, 1);

  await pg.query(`INSERT INTO system_settings VALUES ('courier_whatsapp_directions','false')`);
  assert.equal(await lib.sendCourierDirections("order_abc123", "to_restaurant"), false);
  assert.equal(sent.length, 1);
  await pg.close();
});

test("a WhatsApp failure is reported as not sent and never throws", async () => {
  const lib = load({
    "@workspace/db": { pool: { query: async () => { throw new Error("db down"); } } },
    "./logger": { logger: { warn() {} } },
    "./whatsapp": { whatsappManager: { sendMessage: async () => true } },
  });
  assert.equal(await lib.sendCourierDirections("x", "to_customer"), false);
  assert.equal(lib.directionsText({ stage: "to_customer", orderId: "o1", placeName: "", placePhone: "", place: { lat: null, lon: null },
    customerName: "", customerPhone: "", address: "", destination: { lat: 0, lon: 0 }, orderText: "" }), null, "0,0 is not a real location");
});
