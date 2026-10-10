const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const ts=require('typescript');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/checkoutRequest.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObject});
const {createCheckoutSender}=exportsObject;
function setup(){
 const values=new Map(),calls=[];let failure=false,writeFailure=false,removeFailure=false,block=null;
 const storage={getItem:async k=>values.get(k)||null,setItem:async(k,v)=>{if(writeFailure)throw Error('disk unavailable');values.set(k,v)},removeItem:async k=>{if(removeFailure)throw Error('cleanup unavailable');values.delete(k)}};
 const dependencies={storage,digest:async body=>crypto.createHash('sha256').update(body).digest('hex'),randomKey:()=>crypto.randomUUID(),send:async(body,key,user)=>{calls.push({body,key,user});if(block)await block;if(failure)throw Error('response lost');return {id:'order-'+key}}};
 return {values,calls,dependencies,fail:()=>failure=true,recover:()=>failure=false,failWrite:()=>writeFailure=true,failRemove:()=>removeFailure=true,block:promise=>block=promise};
}
test('lost response survives sender recreation with the same durable key; a confirmed new order gets a new key',async()=>{
 const s=setup();s.fail();await assert.rejects(createCheckoutSender(s.dependencies)('u1','{"items":[1]}'));
 assert.equal(s.values.size,1);s.recover();const send=createCheckoutSender(s.dependencies);await send('u1','{"items":[1]}');
 assert.equal(s.calls[0].key,s.calls[1].key);assert.equal(s.values.size,0);await send('u1','{"items":[1]}');assert.notEqual(s.calls[1].key,s.calls[2].key);
});
test('simultaneous taps share one network operation',async()=>{
 const s=setup();let release;s.block(new Promise(resolve=>release=resolve));const send=createCheckoutSender(s.dependencies);
 const first=send('u1','{}'),second=send('u1','{}');assert.equal(first,second);release();await Promise.all([first,second]);assert.equal(s.calls.length,1);
});
test('uncertain requests are separate for different accounts and different baskets',async()=>{
 const s=setup();s.fail();const send=createCheckoutSender(s.dependencies);
 for(const [user,body] of [['u1','{"a":1}'],['u2','{"a":1}'],['u1','{"a":2}']])await assert.rejects(send(user,body));
 assert.equal(new Set(s.calls.map(c=>c.key)).size,3);assert.equal(s.values.size,3);
});
test('failed persistence stops checkout before sending; cleanup failure preserves retry identity',async()=>{
 const s=setup();s.failWrite();await assert.rejects(createCheckoutSender(s.dependencies)('u1','{}'));assert.equal(s.calls.length,0);
 const r=setup();r.failRemove();const send=createCheckoutSender(r.dependencies);await assert.rejects(send('u1','{}'));await assert.rejects(send('u1','{}'));assert.equal(r.calls[0].key,r.calls[1].key);
});

test('malformed success retains the request identity for recovery',async()=>{
 const s=setup();const original=s.dependencies.send;s.dependencies.send=async(...args)=>{await original(...args);return {}};
 const send=createCheckoutSender(s.dependencies);await assert.rejects(send('u1','{}'));assert.equal(s.values.size,1);
 s.dependencies.send=original;await send('u1','{}');assert.equal(s.calls[0].key,s.calls[1].key);
});
