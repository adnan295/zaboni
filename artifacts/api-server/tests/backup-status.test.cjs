const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(dir, sent) {
  const src = fs.readFileSync(path.join(__dirname, '../src/lib/backupStatus.ts'), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, Date, Number, String, JSON, Math, process: { env: { BACKUP_STATUS_DIR: dir } }, setTimeout: () => ({ unref() {} }), setInterval: () => ({ unref() {} }),
    require: (id) => ({ 'node:fs/promises': require('node:fs/promises'), 'node:path': path, './logger': { logger: { warn() {} } },
      './crashReports': { getCrashAlertPhone: async () => '+963900000000' },
      './whatsapp': { whatsappManager: { sendMessage: async (p, t) => { sent.push(t); return true; } } } })[id] });
  return exports;
}
const write = (dir, obj) => fs.writeFileSync(path.join(dir, 'last.json'), JSON.stringify(obj));

test('backup status: not configured, healthy, stale and failed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-')); const sent = [];
  const lib = load(dir, sent);
  assert.equal((await lib.readBackupStatus()).configured, false);
  await lib.checkBackupsAndAlert(); assert.equal(sent.length, 0, 'no alert before backups are set up');

  const now = Date.parse('2026-11-01T12:00:00Z');
  write(dir, { status: 'ok', at: '2026-11-01T00:00:00Z', lastSuccessAt: '2026-11-01T00:00:00Z', message: 'database 51 tables', dbBytes: 1234 });
  let s = await lib.readBackupStatus(now);
  assert.equal(s.healthy, true); assert.equal(s.ageHours, 12); assert.equal(s.dbBytes, 1234);

  s = await lib.readBackupStatus(now + 20 * 3600_000);
  assert.equal(s.healthy, false, 'older than 26h is stale');

  write(dir, { status: 'failed', at: '2026-11-01T11:00:00Z', lastSuccessAt: '2026-11-01T00:00:00Z', message: 'upload to R2 failed' });
  s = await lib.readBackupStatus(now);
  assert.equal(s.status, 'failed'); assert.equal(s.healthy, false);
  await lib.checkBackupsAndAlert();
  assert.equal(sent.length, 1); assert.match(sent[0], /فشل/); assert.match(sent[0], /upload to R2 failed/);
  await lib.checkBackupsAndAlert();
  assert.equal(sent.length, 1, 'no repeat alert within 12 hours');
});
