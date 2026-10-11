const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const { drizzle } = require('drizzle-orm/pglite');
const orm = require('drizzle-orm');
const { pgTable, text } = require('drizzle-orm/pg-core');

const usersTable = pgTable('users', {
  id: text().primaryKey(), pushToken: text('push_token'), fcmToken: text('fcm_token'), apnToken: text('apn_token'),
});

function load(file, deps) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
    { exports, require: id => id in deps ? deps[id] : id.startsWith('.') ? {} : require(id), crypto, Date, console, process, setImmediate });
  return exports;
}
function response() { return { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } }; }

test('courier test push reaches only the caller, needs a token, and is rate limited', async () => {
  const pg = new PGlite();
  await pg.exec(`CREATE TABLE users(id text primary key,push_token text,fcm_token text,apn_token text);
    INSERT INTO users VALUES('c1',null,'fcm-c1',null),('c2',null,null,null),('c3','ExponentPushToken[x]',null,null);`);
  const routes = new Map(), sent = [];
  const router = new Proxy({}, { get: (_, verb) => (url, ...handlers) => routes.set(`${verb} ${url}`, handlers.at(-1)) });
  const schema = new Proxy({ db: drizzle(pg), usersTable }, { get: (o, k) => k in o ? o[k] : {} });
  load('routes/courier.ts', {
    express: { Router: () => router }, '@workspace/db': schema, 'drizzle-orm': orm,
    '../lib/push': { sendCourierPush: async (devices, title, body, data) => { sent.push({ devices, data }); return { accepted: 1, failed: 0 }; } },
  });
  const call = async userId => { const res = response(); await routes.get('post /courier/test-push')({ auth: { userId }, body: {} }, res); return res; };
  try {
    let res = await call('c1');
    assert.equal(res.statusCode, 200); assert.equal(res.body.ok, true);
    assert.deepEqual(JSON.parse(JSON.stringify(sent[0].devices)), [{ pushToken: null, fcmToken: 'fcm-c1', apnToken: null }]);
    assert.equal(sent[0].data.type, 'courier_test');

    res = await call('c1');
    assert.equal(res.statusCode, 429);
    assert.equal(sent.length, 1);

    res = await call('c2');
    assert.equal(res.statusCode, 409);
    assert.equal(sent.length, 1);

    res = await call('c3');
    assert.equal(res.statusCode, 200);
    assert.equal(sent[1].devices[0].pushToken, 'ExponentPushToken[x]');
  } finally { await pg.close(); }
});
