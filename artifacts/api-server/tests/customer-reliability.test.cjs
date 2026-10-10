// Regression tests execute actual route/middleware code with isolated providers.
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../..');
const reqRoot = createRequire(path.join(root, 'package.json'));
const reqApi = createRequire(path.join(root, 'artifacts/api-server/package.json'));
const ts = reqRoot('typescript');
const noop = () => {};
const asyncNoop = async () => {};
function database(rows = {}) {
  const writes = [];
  function query(op, table) {
    let values;
    const chain = new Proxy({}, { get(_, key) {
      if (key === 'from') return t => { table = t; return chain; };
      if (key === 'values' || key === 'set') return v => { values = v; return chain; };
      if (key === 'then') return (resolve, reject) => {
        if (op !== 'select') writes.push({ op, table, values });
        const data = op === 'insert' ? (Array.isArray(values) ? values : [values])
          : op === 'update' ? [{ ...(rows[table]?.[0] ?? {}), ...values }]
          : typeof rows[table] === 'function' ? rows[table]() : rows[table] ?? [];
        return Promise.resolve(data).then(resolve, reject);
      };
      return () => chain;
    }});
    return chain;
  }
  const db = {
    select: () => query('select'),
    update: t => query('update', t),
    insert: t => query('insert', t),
    delete: t => query('delete', t),
    transaction: async f => f(db),
  };
  return { db, writes };
}

function load(file, dbState = database(), overrides = {}, expose = '', globals = {}) {
  const routes = new Map();
  const router = new Proxy({}, { get: (_, method) => (url, ...handlers) => {
    routes.set(`${method} ${url}`, handlers.at(-1));
  }});
  const dbModule = new Proxy({ db: dbState.db }, { get: (o, k) => k in o ? o[k] : k });
  const orm = new Proxy({}, { get: () => (...args) => args });
  const defaults = {
    '../lib/profileUpdate': {},
    '../lib/courierDispatchPolicy': { MAX_VISIBLE_RADIUS_KM: 15 },
    '../lib/restaurantHours': file.endsWith('restaurantHours.ts') ? {} : load('artifacts/api-server/src/lib/restaurantHours.ts', dbState).exports,
    express: { Router: () => router },
    '@workspace/db': dbModule,
    'drizzle-orm': orm,
    '../orders/server': new Proxy({}, { get: () => asyncNoop }),
    '../lib/orderDispatch': { dispatchOrderNow: asyncNoop },
    '../lib/push': new Proxy({}, { get: () => asyncNoop }),
    '../lib/achievements': { checkAndAwardAchievements: asyncNoop },
    '../lib/customerSubscription': { isUserSubscribed: async () => false, getSubscriptionSettings: async () => ({}) },
    '../lib/coverage': { getActiveCoverageAreas: async () => [], checkCoverage: async () => ({ hasCoverage: false }) },
    '../lib/deliveryZones': { haversineKm: () => 1, getFeeForDistance: async () => ({ fee: 100, outOfRange: false }) },
    '../lib/loyalty': { getLoyaltySettings: async () => ({ pointValue: 1 }), calculateRedeemDiscount: (p, v) => p * v,
      redeemPointsInTx: async () => { throw new Error('Insufficient loyalty points'); } },
    '../lib/courierPoints': {},
    '../lib/referral': {},
    '../lib/sms': { sendSmsViaGateway: async () => { throw new Error('gateway unavailable'); } },
    '../lib/whatsapp': { whatsappManager: { sendMessage: async () => false } },
    jsonwebtoken: { verify: () => ({ userId: 'u1', phone: '+12025550123' }) },
  };
  const code = fs.readFileSync(path.join(root, file), 'utf8') + '\n' + expose;
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const context = { exports: {}, require: name => name in overrides ? overrides[name] : name in defaults ? defaults[name] : reqApi(name),
    process: { env: { NODE_ENV: 'production', JWT_SECRET: 'local-audit-placeholder' } }, console, setImmediate: noop, setInterval: noop, Buffer, ...globals };
  vm.runInNewContext(js, context, { filename: file });
  return { routes, exports: context.exports, ...dbState };
}

function response() {
  return { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; } };
}
function request(extra = {}) {
  return { auth: { userId: 'u1' }, params: {}, query: {}, headers: { authorization: 'Bearer test' },
    socket: { remoteAddress: '127.0.0.1' }, log: { info: noop, warn: noop, error: noop }, body: {}, ...extra };
}

test('a deleted account cannot reuse its signed session; blocked and active accounts remain distinct', async () => {
  for (const [rows, status, allowed] of [[[],401,false],[[{isBlocked:true}],403,false],[[{isBlocked:false}],200,true]]) {
    const m = load('artifacts/api-server/src/middleware/auth.ts', database({usersTable: rows}));
    const res = response(); let next = false;
    await m.exports.requireAuth(request(), res, () => {next=true;});
    assert.equal(res.statusCode,status); assert.equal(next,allowed);
  }
});

test('courier location is available only for active deliveries', async () => {
  for (const status of ['searching','cancelled','delivered','accepted','picked_up','on_way']) {
    let locationReads=0;
    const m=load('artifacts/api-server/src/routes/orders.ts',database({
      ordersTable:[{courierId:'c1',status}],
      usersTable:()=>{locationReads++;return [{courierLat:33.5,courierLon:36.3,courierLocationUpdatedAt:new Date()}];},
    }));
    const res=response();
    await m.routes.get('get /orders/:id/courier-location')(request({params:{id:'o1'}}),res);
    const active=['accepted','picked_up','on_way'].includes(status);
    assert.equal(res.statusCode,active?200:404,status);
    assert.equal(locationReads,active?1:0,status);
    assert.equal('lat' in res.body,active,status);
  }
});

for (const scenario of [
  {name:'WhatsApp succeeds without sending a duplicate SMS',wa:true,smsFails:false,status:200,channel:'whatsapp',smsCalls:0},
  {name:'WhatsApp rejection falls back to SMS',wa:false,smsFails:false,status:200,channel:'sms',smsCalls:1},
  {name:'WhatsApp exception falls back to SMS',wa:'throw',smsFails:false,status:200,channel:'sms',smsCalls:1},
  {name:'both providers failing returns a retryable failure',wa:'throw',smsFails:true,status:503,smsCalls:1},
  {name:'explicit SMS failure never claims success',wa:true,preferSms:true,smsFails:true,status:503,smsCalls:1},
]) test(scenario.name,async()=>{
  let smsCalls=0,waCalls=0; const logged=[];
  const m=load('artifacts/api-server/src/routes/auth.ts',database(),{
    '../lib/whatsapp':{whatsappManager:{sendMessage:async()=>{waCalls++;if(scenario.wa==='throw')throw new Error('private OTP and provider secret');return scenario.wa;}}},
    '../lib/sms':{sendSmsViaGateway:async()=>{smsCalls++;if(scenario.smsFails)throw new Error('private OTP and provider secret');}},
  });
  const res=response();
  await m.routes.get('post /auth/send-otp')(request({body:{phone:'+12025550123',preferSms:scenario.preferSms},log:{info:(...x)=>logged.push(x),warn:(...x)=>logged.push(x)}}),res);
  assert.equal(res.statusCode,scenario.status);
  assert.equal(res.body.success,scenario.status===200);
  assert.equal(res.body.channel,scenario.channel);
  assert.equal(smsCalls,scenario.smsCalls);
  assert.equal(waCalls,scenario.preferSms?0:1);
  assert.equal(JSON.stringify(logged).includes('provider secret'),false);
});

test('overnight hours belong to the shift opening day, with exclusive closing boundary',()=>{
  const m=load('artifacts/api-server/src/lib/restaurantHours.ts',database());
  m.exports.hours=m.exports.computeIsOpenFromHours;
  const overnight={openTime:'18:00',closeTime:'02:00',isClosed:false};
  const closed={...overnight,isClosed:true};
  const cases=[
    [overnight,closed,60,false,false],
    [overnight,overnight,60,false,true],
    [closed,overnight,60,false,true],
    [closed,overnight,120,false,false],
    [overnight,closed,1080,false,true],
    [overnight,closed,1079,false,false],
    [undefined,undefined,60,true,true],
    [{openTime:'09:00',closeTime:'17:00',isClosed:false},closed,600,false,true],
    [{openTime:'09:00',closeTime:'17:00',isClosed:false},closed,1020,false,false],
  ];
  for (const [today,previous,now,fallback,expected] of cases) assert.equal(m.exports.hours(today,previous,now,fallback),expected,JSON.stringify({today,previous,now}));
});


test('every SMS transport receives a 15-second abort deadline', async () => {
  for (const [url,method] of [['https://example.test/sms','GET'],['https://example.test/sms','POST'],['https://api.sms-gate.app/3rdparty/v1/message','POST']]) {
    let timeout, requested=false;
    const m=load('artifacts/api-server/src/lib/sms.ts',database({systemSettingsTable:[{key:'sms_gateway_url',value:url},{key:'sms_gateway_method',value:method}]}),{
      '../lib/logger':{logger:{info:noop}},
      './logger':{logger:{info:noop}},
    },'',{
      AbortSignal:{timeout:ms=>{timeout=ms;return AbortSignal.abort();}},
      fetch:async(_url,options)=>{requested=true;options.signal.throwIfAborted();},
    });
    await assert.rejects(m.exports.sendSmsViaGateway('+12025550123','test'));
    assert.equal(requested,true);assert.equal(timeout,15000);
  }
});

test('closed/missing restaurants and carts below the minimum cannot create an order', async () => {
  for (const [restaurant, price, status] of [[{id:'r1',isOpen:false,minOrder:0},100,422],[{id:'r1',isOpen:true,minOrder:1000},100,422],[null,100,404],[{id:'r1',isOpen:true,minOrder:100},100,201]]) {
    const state=database({restaurantsTable:restaurant?[restaurant]:[],menuItemsTable:[{id:'m1',restaurantId:'r1',isAvailable:true,price,nameAr:'Food'}]});
    const m=load('artifacts/api-server/src/routes/orders.ts',state);
    const res=response();await m.routes.get('post /orders')(request({body:{restaurantId:'r1',items:[{menuItemId:'m1',qty:1}],lat:33.5,lon:36.3}}),res);
    assert.equal(res.statusCode,status);
    if(status!==201)assert.equal(state.writes.length,0);
  }
});

test('failed points redemption rejects checkout and rolls back every provisional write', async () => {
  const state=database({usersTable:[{id:'u1',loyaltyPoints:100}]});
  state.db.transaction=async fn=>{const n=state.writes.length;try{return await fn(state.db);}catch(e){state.writes.splice(n);throw e;}};
  const m=load('artifacts/api-server/src/routes/orders.ts',state,{},'',{Error});
  const res=response();await m.routes.get('post /orders')(request({body:{orderText:'Food',lat:33.5,lon:36.3,usePoints:true}}),res);
  assert.equal(res.statusCode,409);assert.equal(res.body.error,'loyalty_balance_changed');assert.equal(state.writes.length,0);
});

test('food coupon preview uses the cart amount and restaurant',async()=>{
  const m=load('artifacts/api-server/src/routes/orders.ts',database({promoCodesTable:[{id:'p1',code:'FOOD',isActive:true,appliesTo:'food',type:'percent',value:20,maxUsesPerUser:1}],promoUsesTable:[{c:0}],ordersTable:[{c:0}],usersTable:[{phone:'+12025550123'}]}));
  const res=response();await m.routes.get('post /orders/validate-promo')(request({body:{code:'FOOD',deliveryFee:100,itemsTotal:1000,restaurantId:'r1'}}),res);
  assert.equal(res.statusCode,200);assert.equal(res.body.discountAmount,200);
});

test('both profile routes require the shared verified update and propagate its denial',async()=>{
  class Denied extends Error {status=401;}
  for(const [file,route] of [['auth','patch /auth/me'],['courier','patch /courier/profile']]) {
    let call;
    const m=load(`artifacts/api-server/src/routes/${file}.ts`,database({usersTable:[{id:'u1',isBlocked:false}]}),{'../lib/profileUpdate':{ProfileUpdateError:Denied,updateVerifiedProfile:async(...args)=>{call=args;throw new Denied('OTP required');}}});
    const res=response();await m.routes.get(route)(request({body:{phone:'+12025550124',phoneVerificationCode:'123456'}}),res);
    assert.equal(res.statusCode,401);assert.equal(call[0],'u1');assert.equal(call[2],'123456');
  }
});

test('customer cancellation refunds inside the order transaction; failures roll back status',async()=>{
 for(const fail of [false,true]){
  const state=database({ordersTable:[{id:'o1',userId:'u1',status:'searching'}]});let inTx=false,refunded=false;
  state.db.transaction=async fn=>{inTx=true;const n=state.writes.length;try{return await fn(state.db);}catch(e){state.writes.splice(n);throw e;}finally{inTx=false;}};
  const m=load('artifacts/api-server/src/routes/orders.ts',state,{'../lib/loyalty':{refundRedeemedPointsInTx:async(tx,user,id)=>{assert.equal(inTx,true);assert.equal(user,'u1');assert.equal(id,'o1');if(fail)throw new Error('ledger failure');refunded=true;}}});
  const res=response(),run=()=>m.routes.get('delete /orders/:id')(request({params:{id:'o1'}}),res);
  if(fail){await assert.rejects(run());assert.equal(state.writes.length,0);}else{await run();assert.equal(res.statusCode,200);assert.equal(refunded,true);}
 }
});
