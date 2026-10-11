const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {createRequire}=require('node:module');
const req=createRequire(path.resolve(__dirname,'../../../package.json'));
const ts=req('typescript');
const moduleResult={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src/lib/restaurantSearch.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:moduleResult.exports,module:moduleResult});
const {literalSearchPattern,applyRestaurantSearchOptions}=moduleResult.exports;
const rows=[{id:'closed',isOpen:false,deliveryFee:0,rating:4.9,deliveryTime:'١٠–٢٠'},{id:'paid',isOpen:true,deliveryFee:12000,rating:4.8,deliveryTime:'35-45'},{id:'free',isOpen:true,deliveryFee:0,rating:3.5,deliveryTime:'20–30'}];
const ids=r=>Array.from(r,x=>x.id);
test('search metacharacters are literal, Arabic stays unchanged',()=>{assert.equal(literalSearchPattern('شاورما'),'%شاورما%');assert.equal(literalSearchPattern('50%_\\'),'%50\\%\\_\\\\%')});
test('combined filters exclude closed, paid and low-rated restaurants',()=>{assert.deepEqual(ids(applyRestaurantSearchOptions(rows,{openOnly:'1',freeDelivery:'1'})),['free']);assert.deepEqual(ids(applyRestaurantSearchOptions(rows,{openOnly:'1',freeDelivery:'1',minRating:'4'})),[])});
test('sorting honors actual computed fees and Arabic delivery times',()=>{assert.deepEqual(ids(applyRestaurantSearchOptions(rows,{sortBy:'fastest'})),['closed','free','paid']);assert.deepEqual(ids(applyRestaurantSearchOptions(rows,{sortBy:'delivery_fee'})),['closed','free','paid']);assert.deepEqual(ids(applyRestaurantSearchOptions(rows,{sortBy:'rating'})),['closed','paid','free'])});
test('default order is retained and limit applies after filtering',()=>{assert.deepEqual(ids(applyRestaurantSearchOptions(rows,{})),ids(rows));assert.deepEqual(ids(applyRestaurantSearchOptions(rows,{openOnly:'1',limit:'1'})),['paid']);assert.equal(applyRestaurantSearchOptions(rows,{limit:'-1',minRating:'bad'}).length,3);assert.deepEqual(ids(rows),['closed','paid','free'])});
test('nearest first, including sub-100m differences, unknown coordinates last',()=>{
 const {compareRestaurantDistance}=moduleResult.exports;
 const stores=[{id:'far',distanceKm:3},{id:'unknown',distanceKm:null},{id:'near',distanceKm:0.2},{id:'nearer',distanceKm:0.15},{id:'bad',distanceKm:NaN}];
 assert.deepEqual(stores.sort(compareRestaurantDistance).map(r=>r.id),['nearer','near','far','unknown','bad']);
 assert.equal(compareRestaurantDistance({distanceKm:null},{distanceKm:undefined}),0);
 assert.equal(compareRestaurantDistance({distanceKm:2},{distanceKm:2}),0);
});
test('nearest-first is for search only; the home feed keeps the manual ranking',()=>{
 const {isRestaurantSearchRequest}=moduleResult.exports;
 assert.equal(isRestaurantSearchRequest({search:'شاورما',lat:'34.7',lon:'36.7'}),true);
 assert.equal(isRestaurantSearchRequest({category:'برغر',lat:'34.7',lon:'36.7'}),true);
 // Home screen: location (+ optional categoryId) but no search term / category text.
 assert.equal(isRestaurantSearchRequest({lat:'34.7',lon:'36.7'}),false);
 assert.equal(isRestaurantSearchRequest({lat:'34.7',lon:'36.7',categoryId:'c1'}),false);
 assert.equal(isRestaurantSearchRequest({search:'   ',category:''}),false);
 // Search tab "popular" strip asks for rating order without a term.
 assert.equal(isRestaurantSearchRequest({sortBy:'rating',limit:'6',lat:'34.7',lon:'36.7'}),false);
});
