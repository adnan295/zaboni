const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ts = require("typescript");

const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib/ota.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", "process", js)(m, m.exports, require, process);
const ota = m.exports;

const ID1 = "11111111-2222-4333-8444-555555555555";
const ID2 = "66666666-7777-4888-9999-aaaaaaaaaaaa";

async function publish(id, bundleText) {
  await ota.saveFile("1.0.23", "android", id, "_expo/static/js/android/entry.hbc", Buffer.from(bundleText));
  await ota.saveFile("1.0.23", "android", id, "assets/abc", Buffer.from("png-bytes"));
  return ota.finishUpdate({ runtime: "1.0.23", platform: "android", id, message: "test",
    launchAsset: "_expo/static/js/android/entry.hbc", assets: [{ path: "assets/abc", ext: "png" }], expoClient: { name: "زبوني" } });
}

test("publish, serve, roll back one step, then to the store build", async (t) => {
  process.env.OTA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ota-"));
  t.after(() => fs.rmSync(process.env.OTA_DIR, { recursive: true, force: true }));
  assert.equal(await ota.currentUpdate("1.0.23", "android"), null);
  await publish(ID1, "bundle one");
  const u2 = await publish(ID2, "bundle two");
  assert.equal((await ota.currentUpdate("1.0.23", "android")).id, ID2);
  assert.equal(u2.assets[0].contentType, "image/png");
  assert.equal(u2.launchAsset.hash, require("node:crypto").createHash("sha256").update("bundle two").digest("base64url"));
  const manifest = ota.manifestFor(u2, (a) => `https://x/${a.path}`);
  assert.equal(manifest.runtimeVersion, "1.0.23");
  assert.equal(manifest.extra.expoClient.name, "زبوني");
  assert.equal((await ota.rollback("1.0.23", "android")).id, ID1);
  assert.equal((await ota.rollback("1.0.23", "android")).id, null, "back to the code in the store build");
  assert.equal(await ota.currentUpdate("1.0.23", "android"), null);
  assert.equal(await ota.currentUpdate("1.0.23", "ios"), null, "the other platform is separate");
});

test("a missing file or a sneaky path is refused", async (t) => {
  process.env.OTA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ota-"));
  t.after(() => fs.rmSync(process.env.OTA_DIR, { recursive: true, force: true }));
  for (const p of ["../x", "/etc/passwd", "a/../../b", "a b"]) assert.throws(() => ota.safeAssetPath(p), /bad_path/, p);
  assert.equal(ota.safeAssetPath("_expo/static/js/ios/index-1.hbc"), "_expo/static/js/ios/index-1.hbc");
  await assert.rejects(ota.finishUpdate({ runtime: "1.0.23", platform: "ios", id: ID1, message: "", launchAsset: "nope.hbc", assets: [], expoClient: {} }), /missing_file/);
  assert.throws(() => ota.checkTarget("1.0", "ios"), /bad_runtime/);
  assert.throws(() => ota.checkTarget("1.0.23", "web"), /bad_platform/);
});
