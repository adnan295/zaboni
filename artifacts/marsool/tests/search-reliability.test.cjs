const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');const {createRequire}=require('node:module');const req=createRequire(path.resolve(__dirname,'../../../package.json'));const ts=req('typescript');
function screenHarness(file){
 let cursor=0,slots=[],effects=[],timers=new Map(),nextTimer=0,requests=[];
 const react={createElement:()=>null,Fragment:'fragment',useState(initial){const i=cursor++;slots[i]??={value:typeof initial==='function'?initial():initial};return [slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v}]},useRef(v){const i=cursor++;slots[i]??={value:{current:v}};return slots[i].value},useCallback:fn=>fn,useMemo:fn=>fn(),useEffect(fn,deps){const i=cursor++;const old=slots[i];if(!old||!deps||deps.some((d,j)=>d!==old.deps[j])){old?.cleanup?.();slots[i]={deps};effects.push(()=>slots[i].cleanup=fn())}}};
 const rn={StyleSheet:{create:x=>x},Dimensions:{get:()=>({width:390})},Platform:{OS:'web'}};
 const request=url=>{if(!url.includes('search='))return Promise.resolve([]);return new Promise((resolve,reject)=>requests.push({url,resolve,reject}))};
 const mocks={react,'react-native':rn,'react-i18next':{useTranslation:()=>({t:(k,o)=>o?.returnObjects?[]:k,i18n:{language:'ar'}})},'expo-router':{useRouter:()=>({}),useNavigation:()=>({canGoBack:()=>true})},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},'@/hooks/useColors':{useColors:()=>({})},'@/hooks/useTypography':{useBackIcon:()=>''},'@/context/AddressContext':{useAddresses:()=>({defaultAddress:{latitude:34.72,longitude:36.71}})},'@workspace/api-client-react':{customFetch:request},'expo-location':{requestForegroundPermissionsAsync:async()=>({status:'denied'})},'@react-native-async-storage/async-storage':{getItem:async()=>null},'@expo/vector-icons':{MaterialIcons:()=>null}};
 const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports:mod.exports,module:mod,require:n=>mocks[n]||{},setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer},clearTimeout:id=>timers.delete(id),URLSearchParams,console});
 const render=()=>{cursor=0;mod.exports.default();effects.splice(0).forEach(fn=>fn())};render();
 const querySlot=slots.find(s=>s&&s.value==='');
 return {requests,query(q){querySlot.value=q;render()},flush(){const current=[...timers.values()];timers.clear();current.forEach(fn=>fn())},values:()=>slots.map(s=>s?.value),dispose(){slots.forEach(s=>s?.cleanup?.())}};
}
for(const file of ['search.tsx','(tabs)/search.tsx'])test(file+': late responses and errors cannot replace the latest search or a cleared query',async()=>{
 const h=screenHarness(path.resolve(__dirname,'../app',file));h.query('الشام');h.flush();assert.equal(h.requests.length,1);h.query('بيتزا');h.flush();assert.equal(h.requests.length,2);
 h.requests[1].resolve([{id:'new',rating:4,deliveryFee:0,deliveryTime:'20'}]);await new Promise(setImmediate);
 h.requests[0].resolve([{id:'old'}]);await new Promise(setImmediate);
 const populated=()=>h.values().filter(v=>Array.isArray(v)&&v.some(x=>x?.id));assert.equal(populated().some(v=>v.some(x=>x.id==='new')),true);assert.equal(populated().some(v=>v.some(x=>x.id==='old')),false);
 h.query('برغر');h.flush();h.query('');h.requests[2].resolve([{id:'cleared'}]);await new Promise(setImmediate);assert.equal(populated().some(v=>v.some(x=>x.id==='cleared')),false);
 h.query('بحث');h.flush();h.requests[3].reject(new Error('offline'));await new Promise(setImmediate);assert.equal(h.values().includes(true),true);h.dispose();
});
