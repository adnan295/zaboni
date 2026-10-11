const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");
const noop = () => {};

function load(mocks) {
  const source = fs.readFileSync(path.join(__dirname, "../src/lib/crashReports.ts"), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const c = {
    exports: {},
    require: (id) => { if (!(id in mocks)) throw new Error("Unmocked import " + id); return mocks[id]; },
    console, setTimeout, clearTimeout, setInterval: () => ({ unref: noop }), Date, Error,
  };
  vm.runInNewContext(js, c, { filename: "crashReports.ts" });
  return c.exports;
}

async function setup() {
  const pg = new PGlite();
  await pg.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, phone TEXT);
    CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ);
    INSERT INTO users VALUES ('u1', 'سامر', '+963911111111');`);
  const run = async (sql, args) => {
    if (!args && /CREATE (TABLE|INDEX)/.test(sql)) { await pg.exec(sql); return { rows: [], rowCount: 0 }; }
    const r = await pg.query(sql, args);
    return { ...r, rowCount: r.affectedRows ?? r.rows.length };
  };
  const whatsapp = [];
  const lib = load({
    "node:crypto": require("node:crypto"),
    "@workspace/db": { pool: { query: run } },
    "./logger": { logger: { info: noop, warn: noop, error: noop } },
    "./whatsapp": { whatsappManager: { sendMessage: async (phone, text) => { whatsapp.push({ phone, text }); return true; } } },
  });
  await lib.ensureCrashSchema();
  await lib.ensureCrashSchema(); // idempotent on every boot
  return { pg, lib, whatsapp };
}

const report = (over = {}) => ({
  kind: "fatal",
  message: "TypeError: Cannot read property 'name' of undefined",
  stack: "TypeError: Cannot read property 'name' of undefined\n    at OrderCard (address at index.android.bundle:1:52311)\n    at renderWithHooks (address at index.android.bundle:1:9921)",
  platform: "android", osVersion: "13", device: "Xiaomi Redmi Note 12", appVersion: "1.0.18",
  updateId: "abc", route: "/order-tracking/[id]", role: "customer", at: Date.now(),
  ...over,
});

test("fingerprint groups the same bug across bundles and values, but not different bugs", async () => {
  const { lib } = await setup();
  const a = report();
  const b = report({
    message: "TypeError: Cannot read property 'phone' of undefined",
    stack: "TypeError: x\n    at OrderCard (address at index.android.bundle:1:60000)\n    at renderWithHooks (address at index.android.bundle:1:10500)",
  });
  assert.equal(lib.crashFingerprint(a.kind, a.message, a.stack), lib.crashFingerprint(b.kind, b.message, b.stack));
  const other = report({ stack: "TypeError: x\n    at CartScreen (address at index.android.bundle:1:1)" });
  assert.notEqual(lib.crashFingerprint(a.kind, a.message, a.stack), lib.crashFingerprint(other.kind, other.message, other.stack));
});

test("parseCrashInput rejects junk, clips sizes, and clamps bad clocks", async () => {
  const { lib } = await setup();
  assert.equal(lib.parseCrashInput(null), null);
  assert.equal(lib.parseCrashInput({ kind: "nope", message: "x" }), null);
  assert.equal(lib.parseCrashInput({ kind: "fatal", message: "  " }), null);
  const p = lib.parseCrashInput(report({ message: "x".repeat(2000), stack: "s".repeat(10000), at: 0 }));
  assert.equal(p.message.length, 500);
  assert.equal(p.stack.length, 4000);
  assert.ok(Date.now() - p.occurredAt.getTime() < 5000);
});

test("alerts on a new crash once, on spread to 3 people, never when muted, and again when a fixed crash returns", async () => {
  const { pg, lib, whatsapp } = await setup();
  await lib.saveCrashAlertPhone("+963900000000");
  const input = lib.parseCrashInput(report());

  let fp = await lib.recordCrash(input, { userId: "u1", reporter: "u1" });
  await lib.alertCrash(fp, input);
  assert.equal(whatsapp.length, 1);
  assert.match(whatsapp[0].text, /عطل جديد/);
  assert.equal(whatsapp[0].phone, "+963900000000");

  // Same person again, then a second person: known crash, not spreading yet.
  for (const who of ["u1", "u2"]) {
    fp = await lib.recordCrash(input, { userId: who, reporter: who });
    await lib.alertCrash(fp, input);
  }
  assert.equal(whatsapp.length, 1);

  // Third distinct person within 30 min → spreading; but only after the re-alert window.
  await pg.query("UPDATE app_crash_groups SET last_alert_at = NOW() - INTERVAL '7 hours'");
  fp = await lib.recordCrash(input, { userId: null, reporter: "anon:x" });
  await lib.alertCrash(fp, input);
  assert.equal(whatsapp.length, 2);
  assert.match(whatsapp[1].text, /عم ينتشر: صاب 3/);
  fp = await lib.recordCrash(input, { userId: null, reporter: "anon:y" });
  await lib.alertCrash(fp, input);
  assert.equal(whatsapp.length, 2, "no repeat inside the window");

  // Marked fixed, then it happens again → regression alert even inside the window.
  await pg.query("UPDATE app_crashes SET created_at = created_at - INTERVAL '1 hour'");
  await lib.setCrashGroupState(fp, { resolved: true });
  fp = await lib.recordCrash(input, { userId: "u1", reporter: "u1" });
  await lib.alertCrash(fp, input);
  assert.equal(whatsapp.length, 3);
  assert.match(whatsapp[2].text, /رجع عطل/);

  // Muted crashes stay quiet whatever happens.
  const other = lib.parseCrashInput(report({ message: "ReferenceError: foo is not defined", stack: "" }));
  const ofp = lib.crashFingerprint(other.kind, other.message, other.stack);
  await lib.setCrashGroupState(ofp, { muted: true });
  await lib.recordCrash(other, { userId: "u1", reporter: "u1" });
  await lib.alertCrash(ofp, other);
  assert.equal(whatsapp.length, 3);
});

test("no WhatsApp without an alert phone, but the admin banner still lists the crash", async () => {
  const { lib, whatsapp } = await setup();
  const input = lib.parseCrashInput(report());
  const fp = await lib.recordCrash(input, { userId: "u1", reporter: "u1" });
  await lib.alertCrash(fp, input);
  assert.equal(whatsapp.length, 0);
  const alerts = await lib.getActiveCrashAlerts();
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].reason, "new");

  await lib.setCrashGroupState(fp, { resolved: true });
  assert.equal((await lib.getActiveCrashAlerts()).length, 0, "fixed crashes leave the banner");
});

test("overview groups by bug with affected people, versions and who hit it", async () => {
  const { lib } = await setup();
  const input = lib.parseCrashInput(report());
  await lib.recordCrash(input, { userId: "u1", reporter: "u1" });
  await lib.recordCrash(input, { userId: "u1", reporter: "u1" });
  await lib.recordCrash({ ...input, appVersion: "1.0.17", platform: "ios" }, { userId: null, reporter: "anon:z" });
  await lib.recordCrash(lib.parseCrashInput(report({ kind: "render", message: "Error: boom", stack: "" })), { userId: null, reporter: "anon:z" });

  const o = await lib.getCrashOverview(7);
  assert.deepEqual({ ...o.totals }, { crashes: 4, users: 2, groups: 2 });
  const top = o.groups[0];
  assert.equal(top.count, 3);
  assert.equal(top.users, 2);
  assert.deepEqual([...top.versions].sort(), ["1.0.17", "1.0.18"]);
  assert.deepEqual([...top.platforms].sort(), ["android", "ios"]);

  const events = await lib.getCrashEvents(top.fingerprint);
  assert.equal(events.length, 3);
  assert.ok(events.some((e) => e.userName === "سامر" && e.userPhone === "+963911111111"));
});
