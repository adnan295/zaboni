const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib/appVersion.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
let setting = null;
const pool = { query: async () => ({ rows: setting ? [{ value: setting }] : [] }) };
const c = { exports: {}, require: (id) => (id === "@workspace/db" ? { pool } : {}), Date, JSON, Number, String, Math };
vm.runInNewContext(js, c);
const m = c.exports;

const on = { enabled: true, version: "1.0.23" };

test("versions compare by number, not text", () => {
  assert.equal(m.compareVersions("1.0.9", "1.0.23"), -1);
  assert.equal(m.compareVersions("1.0.23", "1.0.23"), 0);
  assert.equal(m.compareVersions("1.1.0", "1.0.23"), 1);
  assert.equal(m.compareVersions(null, "1.0.23"), -1, "no version at all is the oldest");
});

test("who must update: only apps that can show the update page; never old apps, the web, or when off", () => {
  assert.equal(m.isOutdated(undefined, on), false, "apps before 1.0.23 send nothing and are never refused");
  assert.equal(m.isOutdated("1.0.22 ios", on), true);
  assert.equal(m.isOutdated("1.0.23 android", on), false);
  assert.equal(m.isOutdated("1.0.24 ios", on), false);
  assert.equal(m.isOutdated("1.0.1 web", on), false, "the website is always current");
  assert.equal(m.isOutdated(undefined, { ...on, enabled: false }), false, "switched off");
});

test("the guard answers 426 with the Arabic message the old apps already display", async () => {
  setting = JSON.stringify(on);
  const guard = m.requireCurrentApp(m.UPDATE_MESSAGE);
  let status = 0, body = null, passed = false;
  const res = { status(s) { status = s; return this; }, json(b) { body = b; return this; } };
  await guard({ headers: { "x-zaboni-app": "1.0.22 ios" } }, res, () => { passed = true; });
  assert.equal(status, 426);
  assert.equal(body.error, "update_required");
  assert.match(body.message, /حدّث زبوني/);
  assert.equal(passed, false);
});
