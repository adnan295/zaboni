const { test } = require("node:test");
const j = (v) => JSON.parse(JSON.stringify(v));
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");

function load(mocks) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib/directory.ts"), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const c = { exports: {}, require: (id) => { if (!(id in mocks)) throw new Error("Unmocked import " + id); return mocks[id]; },
    Date, Math, Number, String, Map, Set, Array, Promise, Error, JSON, Boolean };
  vm.runInNewContext(js, c);
  return c.exports;
}

async function setup() {
  const pg = new PGlite();
  await pg.exec(`CREATE TABLE orders (id TEXT PRIMARY KEY);`);
  const pool = { query: (sql, args) => (args ? pg.query(sql, args) : pg.exec(sql).then((r) => r[r.length - 1] ?? { rows: [] })) };
  return { pg, lib: load({ "@workspace/db": { pool } }) };
}

const places = [
  { id: "p1", nameAr: "شاورما الأمراء", phone: "0933000001", lat: 34.731, lon: 36.704, district: "الحمرا", category: "شاورما",
    menu: [{ title: "سندويش", items: ["شاورما دجاج", "شاورما لحمة", "كبة لبنية"] }] },
  { id: "p2", nameAr: "فطائر الإيمان", lat: 34.725, lon: 36.700, district: "الإنشاءات", category: "معجنات",
    menu: [{ title: "معجنات", items: ["منقوشة زعتر", "فطيرة جبنة"] }] },
  { id: "p3", nameAr: "مطعم مخفي", lat: 34.72, lon: 36.70, category: "شاورما", isPublished: false, menu: [{ title: "", items: ["كبة"] }] },
];

test("import: places are saved, re-import updates by id, bad rows are reported", async () => {
  const { pg, lib } = await setup();
  const r = await lib.upsertPlaces([...places, { nameAr: "", lat: 1, lon: 1 }, { nameAr: "بلا موقع", lat: NaN, lon: 1 }]);
  assert.equal(r.saved, 3);
  assert.deepEqual(j(r.rejected.map((x) => x.reason)), ["name_required", "bad_location"]);
  await lib.upsertPlaces([{ ...places[1], nameAr: "فطائر الإيمان الجديدة" }]);
  const all = await lib.adminListPlaces();
  assert.equal(all.length, 3, "updated, not duplicated");
  assert.equal(all.find((p) => p.id === "p2").nameAr, "فطائر الإيمان الجديدة");
  await pg.close();
});

test("search finds a dish across Homs, forgiving Arabic spelling, and hides unpublished places", async () => {
  const { pg, lib } = await setup();
  await lib.upsertPlaces(places);
  const kibbeh = await lib.listPlaces({ q: "كبه" }); // typed with ه, menu says ة
  assert.deepEqual(j(kibbeh.map((p) => p.id)), ["p1"], "the unpublished place is not listed");
  assert.deepEqual(JSON.parse(JSON.stringify(kibbeh[0].matches)), ["كبة لبنية"]);
  assert.deepEqual(j((await lib.listPlaces({ q: "الايمان" })).map((p) => p.id)), ["p2"], "أ / ا by name");
  assert.deepEqual(j((await lib.listPlaces({ category: "معجنات" })).map((p) => p.id)), ["p2"]);
  assert.equal((await lib.listPlaces({})).length, 2);
  const cats = JSON.parse(JSON.stringify(await lib.listCategories()));
  assert.deepEqual(cats.map((c) => c.category).sort(), ["شاورما", "معجنات"]);
  assert.equal(await lib.getPlace("p3"), null, "unpublished place cannot be opened");
  await pg.close();
});

test("menus are cleaned: empty sections dropped, text trimmed", async () => {
  const { pg, lib } = await setup();
  await lib.upsertPlaces([{ id: "m", nameAr: "تجربة", lat: 34.7, lon: 36.7, menu: [{ title: "  حلو ", items: ["  كنافة  ", ""] }, { title: "فاضي", items: [] }] }]);
  const p = await lib.getPlace("m");
  assert.deepEqual(JSON.parse(JSON.stringify(p.menu)), [{ title: "حلو", items: ["كنافة"] }]);
  await pg.close();
});
