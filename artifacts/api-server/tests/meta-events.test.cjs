const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const ts = require("typescript");

const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib/metaEvents.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", "process", js)(m, m.exports, require, { env: {} });
const { metaConfig, metaPhone, buildMetaEvent, sendMetaEvents } = m.exports;

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const cfg = { pixelId: "1234567890", token: "x".repeat(40), sypPerUsd: 100 };

test("off until both the pixel id and the token are set", () => {
  assert.equal(metaConfig({}), null);
  assert.equal(metaConfig({ META_PIXEL_ID: "1234567890" }), null);
  assert.equal(metaConfig({ META_PIXEL_ID: "abc", META_CAPI_TOKEN: "x".repeat(40) }), null);
  const c = metaConfig({ META_PIXEL_ID: " 1234567890 ", META_CAPI_TOKEN: "x".repeat(40), META_SYP_PER_USD: "110" });
  assert.equal(c.pixelId, "1234567890");
  assert.equal(c.sypPerUsd, 110);
  assert.equal(metaConfig({ META_PIXEL_ID: "1234567890", META_CAPI_TOKEN: "x".repeat(40) }).sypPerUsd, 120);
});

test("Syrian numbers in any form become 9639XXXXXXXX", () => {
  for (const p of ["0933123456", "933123456", "+963 933 123 456", "00963933123456"]) assert.equal(metaPhone(p), "963933123456");
  assert.equal(metaPhone("+49 151 2345678"), "491512345678");
});

test("only hashes leave the server, and the purchase value goes in USD", () => {
  const e = buildMetaEvent({ name: "Purchase", eventId: "order_o1", time: new Date(1_800_000_000_000), userId: "u_1", phone: "0933123456", valueSyp: 1250, contentIds: ["rest_1"] }, cfg);
  assert.equal(e.event_id, "order_o1");
  assert.equal(e.event_time, 1_800_000_000);
  assert.deepEqual(e.user_data.ph, [sha("963933123456")]);
  assert.deepEqual(e.user_data.external_id, [sha("u_1")]);
  assert.ok(!JSON.stringify(e).includes("0933123456"));
  assert.ok(!JSON.stringify(e).includes("u_1"));
  assert.deepEqual(e.custom_data, { currency: "USD", value: 12.5, content_ids: ["rest_1"], content_type: "product" });
  const r = buildMetaEvent({ name: "CompleteRegistration", eventId: "reg_u_1", time: new Date(), userId: "u_1", phone: "" }, cfg);
  assert.equal(r.custom_data, undefined);
  assert.equal(r.user_data.ph, undefined);
});

test("posts to the pixel, with the test code when set, and reports a refusal", async () => {
  let seen;
  await sendMetaEvents([{ name: "CompleteRegistration", eventId: "reg_u", time: new Date(), userId: "u" }], { ...cfg, testCode: "TEST1" },
    async (url, init) => { seen = { url, body: JSON.parse(init.body) }; return { ok: true, status: 200, text: async () => "" }; });
  assert.match(seen.url, /^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/1234567890\/events\?access_token=x+$/);
  assert.equal(seen.body.test_event_code, "TEST1");
  assert.equal(seen.body.data.length, 1);
  await assert.rejects(
    sendMetaEvents([{ name: "CompleteRegistration", eventId: "r", time: new Date(), userId: "u" }], cfg, async () => ({ ok: false, status: 400, text: async () => "bad" })),
    /meta_capi_400/,
  );
});

test("the dashboard fills what .env leaves empty; .env wins when both are set", () => {
  const { parseStoredMeta } = m.exports;
  const stored = parseStoredMeta(JSON.stringify({ pixelId: "1170322125473647", token: "t".repeat(40), sypPerUsd: 115 }));
  assert.equal(metaConfig({ META_PIXEL_ID: "1170322125473647" }, {}), null);
  const c = metaConfig({ META_PIXEL_ID: "1170322125473647", META_CAPI_TOKEN: "" }, { token: "t".repeat(40) });
  assert.equal(c.token, "t".repeat(40));
  assert.equal(metaConfig({}, stored).sypPerUsd, 115);
  assert.equal(metaConfig({ META_CAPI_TOKEN: "e".repeat(40) }, stored).token, "e".repeat(40));
  assert.deepEqual(parseStoredMeta("not json"), {});
  assert.deepEqual(parseStoredMeta(null), {});
});

test("checking access reads the dataset name and passes on Facebook's reason", async () => {
  const { checkMetaAccess } = m.exports;
  assert.equal(await checkMetaAccess(cfg, async () => ({ ok: true, status: 200, text: async () => '{"id":"1","name":"Zaboni"}' })), "Zaboni");
  await assert.rejects(
    checkMetaAccess(cfg, async () => ({ ok: false, status: 400, text: async () => '{"error":{"message":"Invalid OAuth access token"}}' })),
    /Invalid OAuth access token/,
  );
});
