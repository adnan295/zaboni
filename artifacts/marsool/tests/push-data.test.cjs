const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../utils/pushData.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", js)(m, m.exports, () => ({}));
const { pushData } = m.exports;

const chat = { type: "order_chat", orderId: "o1" };

test("Expo push: data on the content", () => {
  assert.deepEqual(pushData({ content: { data: chat }, trigger: null }), chat);
});

test("Android FCM push from our server: data on remoteMessage", () => {
  assert.deepEqual(pushData({ content: { data: {} }, trigger: { type: "push", remoteMessage: { data: chat } } }), chat);
});

test("iPhone APNs push from our server: data in the raw payload, without aps", () => {
  const payload = { aps: { alert: { title: "رسالة من الزبون" }, sound: "default" }, ...chat };
  assert.deepEqual(pushData({ content: { data: null }, trigger: { type: "push", payload } }), chat);
});
