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
const { pgTable, text, integer, boolean, timestamp } = require('drizzle-orm/pg-core');
const usersTable = pgTable('users', { id: text().primaryKey(), name: text(), phone: text() });
const ordersTable = pgTable('orders', {
  id: text().primaryKey(), userId: text('user_id'), status: text(), courierId: text('courier_id'),
  courierName: text('courier_name'), courierPhone: text('courier_phone'), courierRating: integer('courier_rating'),
  orderText: text('order_text'), restaurantName: text('restaurant_name'), address: text(),
  createdAt: timestamp('created_at', { withTimezone: true }), updatedAt: timestamp('updated_at', { withTimezone: true }),
});
const orderStatusHistoryTable = pgTable('order_status_history', { id: text().primaryKey(), orderId: text('order_id'), status: text(), note: text() });
const courierSubscriptionRequestsTable = pgTable('courier_subscription_requests', {
  id: text().primaryKey(), courierId: text('courier_id'), planId: text('plan_id'), planName: text('plan_name'), planPeriod: text('plan_period'), paidAmount: integer('paid_amount'), status: text(), reviewedAt: timestamp('reviewed_at', { withTimezone: true }), reviewedBy: text('reviewed_by'), adminNote: text('admin_note'), createdAt: timestamp('created_at', { withTimezone: true }),
});
const courierSubscriptionsTable = pgTable('courier_subscriptions', {
  id: text().primaryKey(), courierId: text('courier_id'), planId: text('plan_id'), planName: text('plan_name'), planPeriod: text('plan_period'), startsAt: timestamp('starts_at', { withTimezone: true }), endsAt: timestamp('ends_at', { withTimezone: true }), amount: integer(), status: text(), isActive: boolean('is_active'), gifted: boolean(), createdByAdmin: boolean('created_by_admin'), createdAt: timestamp('created_at', { withTimezone: true }),
});
function load(file, deps) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
    { exports, require: id => id in deps ? deps[id] : id.startsWith('.') ? {} : require(id), crypto, Date, console, process, setImmediate });
  return exports;
}
function response() { return { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } }; }
function request(params = {}, body = {}, query = {}) { return { params, body, query, auth: { userId: 'c1' } }; }
async function setup() {
  const pg = new PGlite(); const db = drizzle(pg);
  await pg.exec(`CREATE TABLE users(id text primary key,name text,phone text);
    INSERT INTO users VALUES('u1','عميل قديم','091234'),('c1','مندوب','091111');
    CREATE TABLE orders(id text primary key,user_id text,status text,courier_id text,courier_name text,courier_phone text,courier_rating int,order_text text,restaurant_name text,address text,created_at timestamptz,updated_at timestamptz);
    CREATE TABLE order_status_history(id text primary key,order_id text,status text,note text);
    CREATE TABLE courier_subscription_requests(id text primary key,courier_id text,plan_id text,plan_name text,plan_period text,paid_amount int,status text,reviewed_at timestamptz,reviewed_by text,admin_note text,created_at timestamptz);
    CREATE TABLE courier_subscriptions(id text primary key,courier_id text,plan_id text,plan_name text,plan_period text,starts_at timestamptz,ends_at timestamptz,amount int,status text,is_active bool,gifted bool,created_by_admin bool,created_at timestamptz default NOW());`);
  const routes = new Map(), events = [], completed = [];
  let beforeTransaction = null, failCompletion = false;
  const database = new Proxy(db, { get(target, key) {
    if (key === 'transaction') return async f => { if (beforeTransaction) { const hook = beforeTransaction; beforeTransaction = null; await hook(); } return target.transaction(f); };
    const v = target[key]; return typeof v === 'function' ? v.bind(target) : v;
  }});
  const schema = new Proxy({ db: database, usersTable, ordersTable, orderStatusHistoryTable, courierSubscriptionsTable, courierSubscriptionRequestsTable }, { get: (o,k) => k in o ? o[k] : {} });
  const router = new Proxy({}, { get: (_, verb) => (url, ...handlers) => routes.set(`${verb} ${url}`, handlers.at(-1)) });
  const deps = {
    express: { Router: () => router }, '@workspace/db': schema, 'drizzle-orm': orm,
    '../lib/adminOrderTransitions': load('lib/adminOrderTransitions.ts', {}),
    '../lib/orderCompletion': { completeOrderInTx: async (_, order) => { if (failCompletion) throw Error('ledger unavailable'); completed.push(order.id); return null; }, notifyReferralReward() {} },
    '../lib/loyalty': { refundRedeemedPointsInTx: async () => {} },
    '../lib/orderDispatch': { dispatchOrderNow: async id => events.push(['dispatch', id]) },
    '../lib/achievements': { checkAndAwardAchievements: async () => {} },
    '../orders/server': { notifyOrderUpdate: (id, order) => events.push(['update', id, order]), sendOrderPush: async () => {} },
  };
  load('routes/admin.ts', deps); load('routes/courier.ts', deps);
  const call = async (name, req) => { const res = response(); await routes.get(name)(req, res); return res; };
  const order = async (status, courier = 'c1') => {
    await pg.query(`INSERT INTO orders VALUES('o1','u1',$1,$2,'Driver','091111',5,'meal','restaurant','address',NOW(),NOW()) ON CONFLICT(id) DO UPDATE SET status=$1,courier_id=$2`, [status, courier]);
  };
  const pending = async () => pg.exec(`INSERT INTO courier_subscription_requests(id,courier_id,plan_id,plan_name,plan_period,paid_amount,status,created_at) VALUES('r1','c1','p1','Monthly','monthly',100,'pending',NOW()-INTERVAL '20 minutes') ON CONFLICT(id) DO UPDATE SET status='pending'`);
  return { pg, db, call, events, completed, order, pending, before: fn => beforeTransaction = fn, failCompletion: () => failCompletion = true };
}

test('admin and courier integration uses persistent data and guarded transitions', async t => {
  const s = await setup();
  try {
    await t.test('admin finds an older order and matching total beyond the first page', async () => {
      await s.pg.exec(`INSERT INTO orders(id,user_id,status,courier_id,order_text,created_at) SELECT 'bulk-'||n,'u1','delivered','','meal',NOW()+n*INTERVAL '1 minute' FROM generate_series(1,60) n`);
      await s.order('searching','');
      let res = await s.call('get /admin/orders',request({}, {}, { search: 'o1', limit: 50 }));
      assert.equal(res.body.total,1); assert.equal(res.body.data[0].id,'o1');
      res = await s.call('get /admin/orders',request({}, {}, { status: 'searching', search: 'عميل', limit: 50 }));
      assert.equal(res.body.total,1); assert.equal(res.body.data.length,1);
      res = await s.call('get /admin/orders',request({}, {}, { search: '%' }));
      assert.equal(res.body.total,0);
    });
    await t.test('searching orders cannot progress without a courier; terminal orders cannot reopen',async()=>{
      for (const [from,to,courier] of [['searching','accepted',''],['searching','delivered',''],['picked_up','searching','c1'],['delivered','searching','c1'],['cancelled','accepted','c1'],['accepted','picked_up','']]) {
        await s.order(from,courier);
        const res=await s.call('patch /admin/orders/:id/status',request({id:'o1'},{status:to}));
        assert.equal(res.statusCode,409,`${from}->${to}`);
        assert.equal((await s.pg.query("SELECT status FROM orders WHERE id='o1'")).rows[0].status,from);
      }
    });
    await t.test('reassignment clears the old courier and redispatches',async()=>{
      await s.order('accepted');
      const res=await s.call('patch /admin/orders/:id/status',request({id:'o1'},{status:'searching'}));
      assert.equal(res.statusCode,200); assert.equal(res.body.courierId,''); assert.equal(res.body.courierPhone,''); assert.equal(res.body.courierRating,0);
      assert.ok(s.events.some(e=>e[0]==='dispatch'&&e[1]==='o1'));
    });
    await t.test('admin completion invokes the shared ledger once and customer receives new status',async()=>{
      await s.order('on_way');
      await s.call('patch /admin/orders/:id/status',request({id:'o1'},{status:'delivered'}));
      await s.call('patch /admin/orders/:id/status',request({id:'o1'},{status:'delivered'}));
      assert.deepEqual(s.completed,['o1']);
      assert.ok(s.events.some(e=>e[0]==='update'&&e[1]==='u1'&&e[2].status==='delivered'));
    });
    await t.test('courier completion invokes the same ledger; failure rolls back delivery',async()=>{
      await s.order('on_way');
      const res=await s.call('patch /courier/orders/:orderId/status',request({orderId:'o1'},{status:'delivered'}));
      assert.equal(res.statusCode,200); assert.equal(s.completed.length,2);
      await s.order('on_way'); s.failCompletion();
      await assert.rejects(s.call('patch /courier/orders/:orderId/status',request({orderId:'o1'},{status:'delivered'})),/ledger unavailable/);
      assert.equal((await s.pg.query("SELECT status FROM orders WHERE id='o1'")).rows[0].status,'on_way');
    });
    await t.test('a request cancelled after the precheck cannot be approved',async()=>{
      await s.pending(); s.before(()=>s.pg.exec("UPDATE courier_subscription_requests SET status='cancelled' WHERE id='r1'"));
      const res=await s.call('post /admin/subscription-requests/:id/approve',request({id:'r1'}));
      assert.equal(res.statusCode,409);
      assert.equal((await s.pg.query('SELECT count(*)::int n FROM courier_subscriptions')).rows[0].n,0);
    });
    await t.test('approval is reflected in courier status, request history, and subscription history',async()=>{
      await s.pending();
      const res=await s.call('post /admin/subscription-requests/:id/approve',request({id:'r1'}));
      assert.equal(res.statusCode,200);
      assert.equal((await s.call('get /courier/subscription/status',request())).body.isActive,true);
      assert.equal((await s.call('get /courier/subscription/request/history',request())).body[0].status,'approved');
      assert.equal((await s.call('get /courier/subscription/history',request())).body.length,1);
      assert.equal((await s.call('post /admin/subscription-requests/:id/approve',request({id:'r1'}))).statusCode,409);
      assert.equal((await s.call('post /admin/subscription-requests/:id/reject',request({id:'r1'}))).statusCode,409);
      assert.equal((await s.pg.query('SELECT count(*)::int n FROM courier_subscriptions')).rows[0].n,1);
    });
  } finally { await s.pg.close(); }
});

test('shared completion calculates customer/courier/referral rewards and defers push until called after commit', async () => {
  const calls = [];
  const tx = { select: () => ({ from: () => ({ where: () => ({ limit: () => ({ for: async () => [{ id: 'ref1', referrerId: 'friend' }] }) }) }) }) };
  const helper = load('lib/orderCompletion.ts', {
    '@workspace/db': { referralsTable: { referredUserId: 'referred', status: 'status' } }, 'drizzle-orm': { and: () => {}, eq: () => {} },
    './loyalty': { getLoyaltySettings: async () => ({ earnRate: 10 }), awardPointsInTx: async (...args) => calls.push(['customer', ...args.slice(1)]) },
    './courierPoints': { getCourierPointValue: async () => 2, awardCourierPointsInTx: async (...args) => calls.push(['courier', ...args.slice(1)]) },
    './referral': { awardReferralPointsInTx: async (...args) => { calls.push(['referral', ...args.slice(1)]); return 500; } },
    './push': { sendPushToUsers: async (...args) => calls.push(['push', ...args]) },
  });
  const reward = await helper.completeOrderInTx(tx, { id: 'o1', userId: 'u1', courierId: 'c1', totalPrice: 25000, deliveryFee: 5000, courierFeeDiscount: 1000, orderType: 'restaurant' });
  assert.equal(calls[0][0], 'customer'); assert.equal(calls[0][1], 'u1'); assert.equal(calls[0][3], 25000);
  assert.deepEqual(calls[1], ['courier', 'c1', 'o1', 1000, 2]);
  assert.equal(reward.userId, 'friend'); assert.equal(reward.points, 500);
  assert.equal(calls.some(c => c[0] === 'push'), false);
  helper.notifyReferralReward(reward);
  assert.equal(calls.at(-1)[0], 'push');
});
