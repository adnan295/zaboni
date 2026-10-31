const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

const noop = () => {};

function load(file, mocks, env) {
  const src = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(js, {
    exports, process: { env }, console, setInterval: () => ({ unref: noop }), AbortSignal, Buffer, Date, Error, JSON, Number,
    fetch: mocks.fetch,
    require: (id) => (id in mocks ? mocks[id] : require(id)),
  });
  return exports;
}

// A fake GitHub: releases list + assets served from memory, through the same
// Response/ReadableStream types Node's fetch returns.
function fakeGitHub(releases) {
  const files = new Map();
  const calls = [];
  const list = releases.map(({ code, version, apk, tamper }) => {
    const meta = { version, versionCode: code, size: apk.length, sha256: crypto.createHash('sha256').update(apk).digest('hex'), file: `zaboni-${version}.apk` };
    const base = `https://github.com/x/releases/download/android-apk-${code}`;
    files.set(`${base}/zaboni-apk.json`, Buffer.from(JSON.stringify(meta)));
    files.set(`${base}/${meta.file}`, tamper ? Buffer.concat([apk.subarray(1), Buffer.from('!')]) : apk);
    return { tag_name: `android-apk-${code}`, draft: false, assets: [
      { name: 'zaboni-apk.json', browser_download_url: `${base}/zaboni-apk.json` },
      { name: meta.file, browser_download_url: `${base}/${meta.file}` }] };
  });
  list.push({ tag_name: 'v2.0.0', draft: false, assets: [] });
  const fetch = async (url) => {
    calls.push(url);
    if (url.startsWith('https://api.github.com/repos/')) return new Response(JSON.stringify(list), { status: 200 });
    const body = files.get(url);
    return body ? new Response(body, { status: 200 }) : new Response('nope', { status: 404 });
  };
  return { fetch, calls };
}

function setup(releases) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apk-'));
  const gh = fakeGitHub(releases);
  const lib = load('lib/apkMirror.ts', { fetch: gh.fetch, './logger': { logger: { info: noop, warn: noop } } }, { APK_DIR: dir });
  return { dir, gh, lib };
}

test('mirrors the newest release, verifies it, and keeps only that APK', async () => {
  const v1 = crypto.randomBytes(4096), v2 = crypto.randomBytes(5000);
  const { dir, lib } = setup([{ code: 112, version: '1.0.18', apk: v1 }, { code: 113, version: '1.0.19', apk: v2 }]);
  fs.writeFileSync(path.join(dir, 'zaboni-1.0.17.apk'), 'old');

  const info = await lib.syncApk();
  assert.equal(info.versionCode, 113);
  assert.equal(info.version, '1.0.19');
  assert.deepEqual(fs.readFileSync(path.join(dir, 'zaboni-1.0.19.apk')), v2);
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.apk')), ['zaboni-1.0.19.apk']);
  assert.equal((await lib.getApkInfo()).sha256, crypto.createHash('sha256').update(v2).digest('hex'));
});

test('does not re-download a version it already has', async () => {
  const apk = crypto.randomBytes(3000);
  const { lib, gh } = setup([{ code: 113, version: '1.0.19', apk }]);
  await lib.syncApk();
  const before = gh.calls.length;
  await lib.syncApk();
  assert.equal(gh.calls.length - before, 1, 'only the release list is fetched');
});

test('rejects a corrupted download and keeps serving the previous APK', async () => {
  const good = crypto.randomBytes(3000);
  const { dir, lib } = setup([{ code: 113, version: '1.0.19', apk: good }]);
  await lib.syncApk();

  const bad = setup([{ code: 114, version: '1.0.20', apk: crypto.randomBytes(3000), tamper: true }]);
  fs.cpSync(dir, bad.dir, { recursive: true });
  await assert.rejects(bad.lib.syncApk(), /integrity/);
  const files = fs.readdirSync(bad.dir);
  assert.ok(files.includes('zaboni-1.0.19.apk'));
  assert.ok(!files.some((f) => f.includes('1.0.20')), 'no partial or bad file left behind');
  assert.equal((await bad.lib.getApkInfo()).version, '1.0.19');
});

test('no releases yet → nothing to serve', async () => {
  const { lib } = setup([]);
  assert.equal(await lib.syncApk(), null);
  assert.equal(await lib.getApkInfo(), null);
});

test('download page offers the APK when mirrored and degrades when not', async () => {
  const page = load('routes/download.ts', {
    express: { Router: () => ({ get() {}, post() {} }) },
    '../middleware/adminAuth': { requireAdmin: noop },
    '../lib/apkMirror': {},
    '../lib/brandIcon': { ZABONI_ICON_DATA_URI: 'data:x' },
    '../lib/logger': { logger: { info: noop } },
    fetch: undefined,
  }, {}).downloadPage;
  const html = page({ version: '1.0.19', versionCode: 113, size: 73_400_320, sha256: 'ab'.repeat(32), file: 'zaboni-1.0.19.apk' });
  assert.match(html, /href="\/download\/zaboni\.apk"/);
  assert.match(html, /النسخة 1\.0\.19 · 70\.0 ميغا/);
  assert.doesNotMatch(html, /fonts\.googleapis|<script src=/, 'no external resources');
  const none = page(null);
  assert.doesNotMatch(none, /zaboni\.apk/);
  assert.match(none, /عم تتجهّز/);
});
