const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks = {}) {
  const src = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: (id) => (id in mocks ? mocks[id] : require(id)), process, Buffer, Date, console, Map, Set });
  return exports;
}

const ipLib = load('lib/clientIp.ts');
const peer = '172.18.0.5'; // container nginx on the docker network

test('a spoofed X-Forwarded-For cannot choose the client IP', () => {
  // client sent a fake header; host nginx appended the real client; container nginx appended the host gateway
  const headers = { 'x-forwarded-for': '203.0.113.77, 85.12.34.56, 172.18.0.1' };
  assert.equal(ipLib.clientIpFrom(headers, peer), '85.12.34.56');
});

test('through Cloudflare the real client is found, even with a spoofed header', () => {
  const viaCf = { 'x-forwarded-for': '203.0.113.77, 85.12.34.56, 162.158.10.20, 172.18.0.1' };
  assert.equal(ipLib.clientIpFrom(viaCf, peer), '85.12.34.56');
  // host nginx replaced XFF with the Cloudflare edge: fall back to CF-Connecting-IP
  const overwritten = { 'x-forwarded-for': '162.158.10.20, 172.18.0.1', 'cf-connecting-ip': '85.12.34.56' };
  assert.equal(ipLib.clientIpFrom(overwritten, peer), '85.12.34.56');
});

test('CF-Connecting-IP is ignored unless Cloudflare actually relayed the request', () => {
  const direct = { 'x-forwarded-for': '85.12.34.56, 172.18.0.1', 'cf-connecting-ip': '203.0.113.77' };
  assert.equal(ipLib.clientIpFrom(direct, peer), '85.12.34.56');
});

test('IPv4-mapped IPv6 peers and trust checks', () => {
  assert.equal(ipLib.normalizeIp('::ffff:172.18.0.5'), '172.18.0.5');
  assert.equal(ipLib.trustProxy('::ffff:172.18.0.5'), true);
  assert.equal(ipLib.trustProxy('104.16.1.1'), true); // Cloudflare
  assert.equal(ipLib.trustProxy('85.12.34.56'), false);
  assert.equal(ipLib.clientIp({ headers: {}, socket: { remoteAddress: '::ffff:85.12.34.56' } }), '85.12.34.56');
});

test('admin password guessing is throttled per IP and never blocks a verified token', async () => {
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('correct-horse', 4);
  const admin = load('middleware/adminAuth.ts', {
    '@workspace/db': { db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ value: hash }] }) }) }) }, systemSettingsTable: { key: 'key', value: 'value' } },
    'drizzle-orm': { eq: () => ({}) },
    '../lib/clientIp': ipLib,
  });
  admin.resetAdminThrottle();
  assert.equal(await admin.verifyAdminToken('correct-horse', '85.0.0.1'), true);
  for (let i = 0; i < 10; i++) assert.equal(await admin.verifyAdminToken('guess' + i, '85.0.0.2'), false);
  assert.equal(admin.adminAttemptsBlocked('85.0.0.2'), true);
  // even the right password is refused from the blocked IP…
  assert.equal(await admin.verifyAdminToken('correct-horse-2', '85.0.0.2'), false);
  // …but other IPs and an already-verified session keep working
  assert.equal(admin.adminAttemptsBlocked('85.0.0.3'), false);
  assert.equal(await admin.verifyAdminToken('correct-horse', '85.0.0.2'), true, 'cached verified token is not throttled');
  assert.equal(admin.looksLikeJwt('eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ1MSJ9.c2ln'), true);
  assert.equal(admin.looksLikeJwt('my.admin.password'), false);
});

test('storage paths cannot escape their root', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/lib/objectStorage.ts'), 'utf8');
  const fn = /export function resolveInside[\s\S]*?\n}\n/.exec(src)[0];
  const js = ts.transpileModule(fn, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; vm.runInNewContext(js, { exports, path });
  const root = '/data/storage/public';
  assert.equal(exports.resolveInside(root, 'uploads/abc'), '/data/storage/public/uploads/abc');
  for (const evil of ['../../../proc/self/environ', 'uploads/../../private/x', 'a/../../../etc/passwd', '/etc/passwd', '..']) {
    assert.equal(exports.resolveInside(root, evil), null, evil);
  }
  assert.equal(exports.resolveInside(root, 'uploads/../apk/current.json'), '/data/storage/public/apk/current.json');
});
