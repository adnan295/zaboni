const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ts=require('typescript');
const {PGlite}=require('@electric-sql/pglite');
const {drizzle}=require('drizzle-orm/pglite');
const {pgTable,text,integer,boolean,timestamp}=require('drizzle-orm/pg-core');
const orm=require('drizzle-orm');
const usersTable=pgTable('users',{id:text().primaryKey(),phone:text().unique(),name:text(),avatarUrl:text('avatar_url'),isBlocked:boolean('is_blocked'),loyaltyPoints:integer('loyalty_points')});
const otpCodesTable=pgTable('otp_codes',{id:text().primaryKey(),phone:text(),code:text(),used:boolean(),expiresAt:timestamp('expires_at',{withTimezone:true})});
const loyaltyTransactionsTable=pgTable('loyalty_transactions',{id:text().primaryKey(),userId:text('user_id'),orderId:text('order_id'),type:text(),points:integer(),description:text()});
function load(file,db){
 const source=fs.readFileSync(path.join(__dirname,'../src/lib',file),'utf8');
 const module={exports:{},require:id=>id==='@workspace/db'?{db,usersTable,otpCodesTable,loyaltyTransactionsTable}:require(id),Error,Date,Map,console};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,module);return module.exports;
}
test('PostgreSQL transactions protect phone ownership and loyalty balances',async t=>{
 const pg=new PGlite();const db=drizzle(pg);
 await pg.exec(`CREATE TABLE users(id text primary key,phone text unique,name text,avatar_url text,is_blocked boolean default false,loyalty_points int default 0);
 CREATE TABLE otp_codes(id text primary key,phone text,code text,used boolean default false,expires_at timestamptz);
 CREATE TABLE loyalty_transactions(id text primary key,user_id text,order_id text,type text,points int,description text);
 INSERT INTO users(id,phone,name,loyalty_points) VALUES('u1','+12025550123','User',100),('u2','+12025550125','Other',0);`);
 const profile=load('profileUpdate.ts',db),loyalty=load('loyalty.ts',db);
 await t.test('unverified and expired OTP changes preserve the original account',async()=>{
  await assert.rejects(profile.updateVerifiedProfile('u1',{phone:'+12025550124'}),e=>e.status===400);
  await pg.exec(`INSERT INTO otp_codes VALUES('expired','+12025550124','123456',false,NOW()-INTERVAL '1 minute')`);
  await assert.rejects(profile.updateVerifiedProfile('u1',{phone:'+12025550124'},'123456'),e=>e.status===401);
  assert.equal((await db.select().from(usersTable).where(orm.eq(usersTable.id,'u1')))[0].phone,'+12025550123');
 });
 await t.test('a valid OTP changes the phone once and cannot be replayed',async()=>{
  await pg.exec(`INSERT INTO otp_codes VALUES('valid','+12025550124','654321',false,NOW()+INTERVAL '10 minutes')`);
  const saved=await profile.updateVerifiedProfile('u1',{phone:'+12025550124'},'654321');assert.equal(saved.phone,'+12025550124');
  assert.equal((await pg.query(`SELECT used FROM otp_codes WHERE id='valid'`)).rows[0].used,true);
  await pg.exec(`UPDATE users SET phone='+12025550123' WHERE id='u1'`);
  await assert.rejects(profile.updateVerifiedProfile('u1',{phone:'+12025550124'},'654321'),e=>e.status===401);
 });
 await t.test('another account number cannot be claimed even with a code',async()=>{
  await assert.rejects(profile.updateVerifiedProfile('u1',{phone:'+12025550125'},'123456'),e=>e.status===409);
 });
 await t.test('successful debit records the ledger; competing insufficient debit does not',async()=>{
  await db.transaction(tx=>loyalty.redeemPointsInTx(tx,'u1','o1',80,{pointValue:1}));
  await assert.rejects(db.transaction(tx=>loyalty.redeemPointsInTx(tx,'u1','o2',80,{pointValue:1})));
  assert.equal((await pg.query(`SELECT loyalty_points FROM users WHERE id='u1'`)).rows[0].loyalty_points,20);
  assert.equal((await pg.query(`SELECT count(*)::int AS n FROM loyalty_transactions`)).rows[0].n,1);
 });
 await t.test('repeated cancellation refunds exactly once',async()=>{
  assert.equal(await db.transaction(tx=>loyalty.refundRedeemedPointsInTx(tx,'u1','o1')),80);
  assert.equal(await db.transaction(tx=>loyalty.refundRedeemedPointsInTx(tx,'u1','o1')),0);
  assert.equal((await pg.query(`SELECT loyalty_points FROM users WHERE id='u1'`)).rows[0].loyalty_points,100);
 });
 await t.test('failure after a debit rolls back both ledger and balance',async()=>{
  await assert.rejects(db.transaction(async tx=>{await loyalty.redeemPointsInTx(tx,'u1','o3',50,{pointValue:1});throw new Error('order write failed');}));
  assert.equal((await pg.query(`SELECT loyalty_points FROM users WHERE id='u1'`)).rows[0].loyalty_points,100);
  assert.equal((await pg.query(`SELECT count(*)::int AS n FROM loyalty_transactions WHERE order_id='o3'`)).rows[0].n,0);
 });
 await pg.close();
});
