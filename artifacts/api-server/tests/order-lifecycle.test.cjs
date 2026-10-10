// Actual route handlers and ledgers, actual Drizzle schema, isolated PostgreSQL.
// External notifications/dispatch are captured; no live service or credentials.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const ts=require('typescript');
const {PGlite}=require('@electric-sql/pglite');
const {drizzle}=require('drizzle-orm/pglite');
const {AsyncLocalStorage}=require('node:async_hooks');
const dbRequire=createRequire(path.resolve(__dirname,'../../../lib/db/package.json'));
const {generateDrizzleJson,generateMigration}=dbRequire('drizzle-kit/api');
const schemaCache=new Map();
function schemaLoad(file){
 if(schemaCache.has(file))return schemaCache.get(file);
 const exports={};schemaCache.set(file,exports);
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:id=>id.startsWith('.')?schemaLoad(path.resolve(path.dirname(file),id+'.ts')):dbRequire(id)});
 return exports;
}
const schema=schemaLoad(path.resolve(__dirname,'../../../lib/db/src/schema/index.ts'));
async function setup(){
 const pg=new PGlite(); const db=drizzle(pg);const ddl=await generateMigration(generateDrizzleJson({}),generateDrizzleJson(schema));
 for(const statement of ddl) await pg.exec(statement);
 // PGlite has a single connection. Route helper reads inside a transaction use
 // that same connection instead of waiting for their own transaction to finish.
 const context=new AsyncLocalStorage();
 const database=new Proxy(db,{get(target,key){
  if(key==='transaction')return fn=>target.transaction(tx=>context.run(tx,()=>fn(tx)));
  const source=context.getStore()||target;const value=source[key];return typeof value==='function'?value.bind(source):value;
 }});
 const routes=new Map(),events=[];const cache=new Map();
 const captures=new Proxy({}, {get:(_,name)=>(...args)=>{events.push({name,args});return Promise.resolve();}});
 const deps={
  '@workspace/db':{...schema,db:database},
  express:{Router:()=>new Proxy({}, {get:(_,method)=>(url,...handlers)=>routes.set(method+' '+url,handlers.at(-1))})},
  '../orders/server':captures,'../lib/push':captures,'./push':captures,
  '../lib/orderDispatch':{dispatchOrderNow:async id=>events.push({name:'dispatch',args:[id]})},
  '../lib/achievements':{checkAndAwardAchievements:async()=>{}},
  '../lib/objectStorage':{ObjectStorageService:class{}},'../lib/webPush':{},'../lib/promoBannerComposer':{},'../lib/whatsapp':{},'../lib/sms':{},
 };
 function load(file){
  if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,require:id=>id in deps?deps[id]:id.startsWith('.')?load(path.resolve(path.dirname(file),id+'.ts')):require(id),console,Date,Error,Buffer,crypto:require('node:crypto'),process:{env:{}},setImmediate:()=>{},setInterval:()=>{},fetch:()=>{throw Error('External network forbidden in lifecycle test')}});
  return exports;
 }
 for(const route of ['orders','courier','admin','restaurant-portal'])load(path.resolve(__dirname,'../src/routes',route+'.ts'));
 const call=async(key,userId='customer',body={},params={},query={},restaurantId='restaurant',headers={})=>{const res={statusCode:200,status(n){this.statusCode=n;return this},json(v){this.body=v;return this}};const req={auth:{userId},restaurantAuth:{restaurantId},body,params,query,headers,log:{info(){},warn(){},error(){}}};assert.ok(routes.has(key),key);await routes.get(key)(req,res);return res};
 await db.insert(schema.usersTable).values([{id:'customer',phone:'TEST-CUSTOMER',name:'عميل اختبار'},{id:'courier',phone:'TEST-COURIER',name:'مندوب اختبار',role:'courier',isOnline:true,courierLat:33.5138,courierLon:36.2765},{id:'other',phone:'TEST-OTHER'}]);
 await db.insert(schema.restaurantsTable).values({id:'restaurant',name:'Test',nameAr:'مطعم اختبار',category:'food',categoryAr:'وجبات',deliveryTime:'20',image:'',lat:33.5138,lon:36.2765,isOpen:true});
 await db.insert(schema.menuItemsTable).values({id:'meal',restaurantId:'restaurant',name:'Meal',nameAr:'وجبة اختبار',price:35000,image:'',category:'food',categoryAr:'وجبات'});
 await db.insert(schema.courierSubscriptionsTable).values({id:'sub',courierId:'courier',planName:'Test',planPeriod:'monthly',startsAt:new Date(Date.now()-86400000),endsAt:new Date(Date.now()+86400000),status:'paid',isActive:true});
 return {pg,db,call,events};
}
test('complete restaurant order: checkout → restaurant/admin → courier → delivery → rewards → rating',async t=>{
 const s=await setup();try{
  const created=await s.call('post /orders','customer',{restaurantId:'restaurant',restaurantName:'مطعم اختبار',address:'عنوان وهمي للاختبار',lat:33.514,lon:36.277,items:[{menuItemId:'meal',qty:2,note:'بدون بصل'}]});
  assert.equal(created.statusCode,201,JSON.stringify(created.body));const id=created.body.id;assert.equal(created.body.status,'searching');assert.equal(created.body.totalPrice,70000);assert.equal(created.body.items[0].qty,2);
  assert.ok(s.events.some(e=>e.name==='dispatch'&&e.args[0]===id));assert.ok(s.events.some(e=>e.name==='notifyRestaurantNewOrder'&&e.args[0]==='restaurant'));
  await t.test('same order and item totals are visible to the customer, restaurant and admin',async()=>{
   const customer=await s.call('get /orders/:id','customer',{}, {id});assert.equal(customer.body.totalPrice,70000);
   const restaurant=await s.call('get /restaurant-portal/orders');assert.equal(restaurant.body[0].id,id);assert.equal(restaurant.body[0].items[0].lineTotal,70000);
   const otherRestaurant=await s.call('get /restaurant-portal/orders','customer',{}, {},{},'other-restaurant');assert.equal(otherRestaurant.body.length,0);
   const admin=await s.call('get /admin/orders','admin',{}, {},{search:id});assert.equal(admin.body.total,1);assert.equal(admin.body.data[0].id,id);
   assert.equal((await s.call('get /orders/:id','other',{}, {id})).statusCode,404);
  });
  await t.test('courier sees and accepts the order once, with consistent customer status',async()=>{
   assert.ok((await s.call('get /courier/orders/available','courier')).body.some(o=>o.id===id));
   assert.equal((await s.call('post /courier/orders/:orderId/accept','courier',{}, {orderId:id})).statusCode,200);
   assert.equal((await s.call('post /courier/orders/:orderId/accept','courier',{}, {orderId:id})).statusCode,409);
   assert.equal((await s.call('get /orders/:id','customer',{}, {id})).body.courierId,'courier');
   assert.equal((await s.call('delete /orders/:id','customer',{}, {id})).statusCode,409);
   assert.equal((await s.call('patch /courier/orders/:orderId/status','courier',{status:'delivered'},{orderId:id})).statusCode,409);
  });
  await t.test('pickup, on-way and delivery persist and appear in all roles',async()=>{
   for(const status of ['picked_up','on_way','delivered']){
    const changed=await s.call('patch /courier/orders/:orderId/status','courier',{status},{orderId:id});assert.equal(changed.statusCode,200,JSON.stringify(changed.body));
    assert.equal((await s.call('get /orders/:id','customer',{}, {id})).body.status,status);
    assert.equal((await s.call('get /restaurant-portal/orders')).body[0].status,status);
    assert.equal((await s.call('get /admin/orders','admin',{}, {},{search:id})).body.data[0].status,status);
   }
   assert.equal((await s.call('get /courier/orders/active','courier')).body.some(o=>o.id===id),false);
   assert.equal((await s.call('get /orders/:id/courier-location','customer',{}, {id})).statusCode,404);
   assert.equal((await s.call('patch /courier/orders/:orderId/status','courier',{status:'delivered'},{orderId:id})).statusCode,409);
   const rewards=await s.db.select().from(schema.loyaltyTransactionsTable);assert.equal(rewards.filter(r=>r.orderId===id&&r.type==='earn').length,1);
   const history=await s.pg.query('SELECT status FROM order_status_history WHERE order_id=$1 ORDER BY created_at',[id]);assert.deepEqual(history.rows.map(r=>r.status),['searching','accepted','picked_up','on_way','delivered']);
  });
  await t.test('rating reaches restaurant and courier, and cannot be duplicated',async()=>{
   const body={restaurantStars:5,courierStars:4,comment:'اختبار محلي'};
   assert.equal((await s.call('post /orders/:id/rate','customer',body,{id})).statusCode,201);
   assert.equal((await s.call('post /orders/:id/rate','customer',body,{id})).statusCode,409);
   const ratings=await s.db.select().from(schema.orderRatingsTable);assert.equal(ratings[0].restaurantId,'restaurant');assert.equal(ratings[0].courierId,'courier');
  });

  await t.test('searching cancellation persists, refunds points once and disappears from available orders',async()=>{
   await s.pg.exec("UPDATE users SET loyalty_points=50 WHERE id='customer'");
   const order=await s.call('post /orders','customer',{restaurantId:'restaurant',lat:33.514,lon:36.277,usePoints:true,items:[{menuItemId:'meal',qty:1}]});
   assert.equal(order.statusCode,201);const cancelId=order.body.id;
   assert.equal(order.body.pointsRedeemed,50);
   assert.equal((await s.call('delete /orders/:id','customer',{}, {id:cancelId})).statusCode,200);
   assert.equal((await s.call('delete /orders/:id','customer',{}, {id:cancelId})).statusCode,409);
   assert.equal((await s.call('get /orders/:id','customer',{}, {id:cancelId})).body.status,'cancelled');
   assert.equal((await s.call('get /courier/orders/available','courier')).body.some(o=>o.id===cancelId),false);
   assert.equal((await s.pg.query("SELECT loyalty_points FROM users WHERE id='customer'")).rows[0].loyalty_points,50);
  });
  await t.test('errand order follows the same acceptance and delivery lifecycle',async()=>{
   const order=await s.call('post /orders','customer',{orderType:'errand',placeName:'محل تجريبي',orderText:'شراء غرض تجريبي',lat:33.514,lon:36.277});
   assert.equal(order.statusCode,201);assert.equal(order.body.orderType,'errand');const errandId=order.body.id;
   assert.equal((await s.call('post /courier/orders/:orderId/accept','courier',{}, {orderId:errandId})).statusCode,200);
   for(const status of ['picked_up','on_way','delivered'])assert.equal((await s.call('patch /courier/orders/:orderId/status','courier',{status},{orderId:errandId})).statusCode,200);
   assert.equal((await s.call('get /orders/:id','customer',{}, {id:errandId})).body.status,'delivered');
  });
  await t.test('checkout retry must not create a second order after a lost response', async()=>{
   const body={restaurantId:'restaurant',lat:33.514,lon:36.277,items:[{menuItemId:'meal',qty:1}]};
   const headers={'idempotency-key':'local-lost-response-retry'};
   const first=await s.call('post /orders','customer',body,{}, {},'restaurant',headers);
   const retry=await s.call('post /orders','customer',body,{}, {},'restaurant',headers);
   assert.equal(first.statusCode,201);assert.equal(retry.statusCode,201);
   assert.equal(retry.body.id,first.body.id,'Uncertain-response retry created another order');
  });
  await t.test('concurrent accepts must obey pickup-current-first for one courier', async()=>{
   const create=()=>s.call('post /orders','customer',{restaurantId:'restaurant',lat:33.514,lon:36.277,items:[{menuItemId:'meal',qty:1}]});
   const a=await create(),b=await create();
   const results=await Promise.all([a,b].map(order=>s.call('post /courier/orders/:orderId/accept','courier',{}, {orderId:order.body.id})));
   assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409],'Both new pickups were accepted simultaneously');
  });

  await t.test('concurrent keyed checkouts create one order, one ledger debit and one dispatch',async()=>{
   await s.pg.exec("UPDATE users SET loyalty_points=40 WHERE id='customer'");
   const body={restaurantId:'restaurant',lat:33.514,lon:36.277,usePoints:true,items:[{menuItemId:'meal',qty:1}]};
   const headers={'idempotency-key':'concurrent-checkout-001'};
   const countBefore=(await s.pg.query('SELECT count(*)::int n FROM orders')).rows[0].n;
   const results=await Promise.all([1,2].map(()=>s.call('post /orders','customer',body,{}, {},'restaurant',headers)));
   assert.deepEqual(results.map(r=>r.statusCode),[201,201]);assert.equal(results[0].body.id,results[1].body.id);
   const id=results[0].body.id;
   assert.equal((await s.pg.query('SELECT count(*)::int n FROM orders')).rows[0].n,countBefore+1);
   assert.equal((await s.pg.query("SELECT count(*)::int n FROM loyalty_transactions WHERE order_id=$1 AND type='redeem'",[id])).rows[0].n,1);
   assert.equal(s.events.filter(e=>e.name==='dispatch'&&e.args[0]===id).length,1);
   // A price/availability change after commit must not invalidate recovery of that order.
   await s.pg.exec("UPDATE menu_items SET is_available=false WHERE id='meal'");
   assert.equal((await s.call('post /orders','customer',body,{}, {},'restaurant',headers)).body.id,id);
   await s.pg.exec("UPDATE menu_items SET is_available=true WHERE id='meal'");
   const conflict=await s.call('post /orders','customer',{...body,items:[{menuItemId:'meal',qty:2}]},{}, {},'restaurant',headers);
   assert.equal(conflict.statusCode,409);assert.equal(conflict.body.error,'idempotency_key_conflict');
  });
  await t.test('failed order transaction rolls back its request key and can be retried',async()=>{
   const body={restaurantId:'restaurant',lat:33.514,lon:36.277,items:[{menuItemId:'meal',qty:1}]};const headers={'idempotency-key':'transaction-failure-001'};
   await s.pg.exec("CREATE FUNCTION reject_test_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test write failure'; END $$; CREATE TRIGGER reject_order BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION reject_test_order();");
   await assert.rejects(s.call('post /orders','customer',body,{}, {},'restaurant',headers));
   assert.equal((await s.pg.query("SELECT count(*)::int n FROM order_creation_requests WHERE request_key='transaction-failure-001'")).rows[0].n,0);
   await s.pg.exec('DROP TRIGGER reject_order ON orders; DROP FUNCTION reject_test_order();');
   assert.equal((await s.call('post /orders','customer',body,{}, {},'restaurant',headers)).statusCode,201);
  });
  await t.test('same key is isolated by customer; errand retry is deduplicated too',async()=>{
   const body={orderType:'errand',placeName:'محل تجريبي',lat:33.514,lon:36.277};const headers={'idempotency-key':'errand-recovery-001'};
   const first=await s.call('post /orders','customer',body,{}, {},'restaurant',headers);
   const again=await s.call('post /orders','customer',body,{}, {},'restaurant',headers);
   const other=await s.call('post /orders','other',body,{}, {},'restaurant',headers);
   assert.equal(first.statusCode,201);assert.equal(again.body.id,first.body.id);assert.notEqual(other.body.id,first.body.id);
   assert.equal((await s.call('post /orders','customer',body,{}, {},'restaurant',{'idempotency-key':'bad'})).statusCode,400);
  });
  await t.test('concurrent subscription applications create only one pending request',async()=>{
   await s.db.insert(schema.courierSubscriptionPlansTable).values({id:'plan',name:'Monthly',period:'monthly',price:100});
   const results=await Promise.all([1,2].map(()=>s.call('post /courier/subscription/request','other',{planId:'plan',paidAmount:100})));
   assert.deepEqual(results.map(r=>r.statusCode).sort(),[201,409]);
   assert.equal((await s.pg.query("SELECT count(*)::int n FROM courier_subscription_requests WHERE courier_id='other' AND status='pending'")).rows[0].n,1);
  });
 }finally{await s.pg.close()}
});
