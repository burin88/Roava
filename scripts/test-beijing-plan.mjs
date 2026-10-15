import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

let repository;
let storage;
const cache = new Map();
function load(file) {
  const filename = path.resolve(file);
  if (cache.has(filename)) return cache.get(filename);
  const exports = {};
  cache.set(filename,exports);
  const js = ts.transpileModule(fs.readFileSync(filename,'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true },
  }).outputText;
  vm.runInNewContext(js, {
    exports,
    require: name => name === '@angular/core' ? {
      Injectable: () => target => target, inject: () => repository,
      computed: callback => callback,
      signal: initial => { let value = initial; const read = () => value; read.set = next => { value=next; }; return read; },
    } : load(path.resolve(path.dirname(filename), `${name}.ts`)),
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key,value) => storage.set(key,value) },
  });
  return exports;
}
const { createBeijingTianjinTrips, mergeBeijingPlan, BEIJING_TRIP_ID, TIANJIN_TRIP_ID, BEIJING_PLAN_KEY } = load('src/app/core/data/beijing-trips.ts');
const { BEIJING_ITINERARY } = load('src/app/core/data/beijing-itinerary.ts');
const { countTravelDays } = load('src/app/core/models/travel-days.ts');
const { provincesForTrip } = load('src/app/core/data/china-provinces.ts');
const { TravelStore } = load('src/app/core/state/travel-store.ts');
const shapes = JSON.parse(fs.readFileSync('public/assets/maps/china/provinces.json','utf8')).provinces;
const empty = () => ({ schemaVersion:1, profile:{ displayName:'Existing profile' }, trips:[] });
const plain = value => JSON.parse(JSON.stringify(value));
const fixture = async () => {
  storage = new Map();
  let document = empty();
  let writes = 0;
  repository = {
    getDocument: async () => structuredClone(document),
    getTrips: async () => structuredClone(document.trips),
    replaceDocument: async next => { document=structuredClone(next); writes++; },
  };
  const store = new TravelStore();
  await store.reload();
  return { store, document: () => document, writes: () => writes };
};

test('the plan creates Beijing and Tianjin records belonging to the same seven-day journey', () => {
  const trips = createBeijingTianjinTrips('2026-10-15T00:00:00.000Z');
  assert.equal(trips.length,2);
  assert.equal(trips[0].cityCode,'BEIJING');
  assert.equal(trips[0].provinceCode,'110000');
  assert.equal(trips[0].startDate,'2026-10-29');
  assert.equal(trips[0].endDate,'2026-11-04');
  assert.equal(trips[1].cityCode,'TIANJIN');
  assert.equal(trips[1].provinceCode,'120000');
  assert.equal(trips[1].startDate,'2026-11-03');
  assert.equal(trips[1].endDate,'2026-11-03');
  assert.equal(trips[0].journeyGroupId,trips[1].journeyGroupId);
  assert.equal(countTravelDays(trips),7);
  assert.equal(countTravelDays(trips.map(trip => ({...trip,journeyGroupId:undefined}))),8);
});

test('all itinerary stops are represented once with dates, times, MRT details and seven distinct days', () => {
  const trips = createBeijingTianjinTrips();
  const places = trips.flatMap(trip => trip.places);
  assert.equal(new Set(places.map(place => place.id)).size,places.length);
  assert.equal(new Set(places.map(place => place.visitedAt)).size,7);
  for (const day of BEIJING_ITINERARY) {
    for (const stop of day.stops) {
      const [date,month] = day.date.split('/');
      const matches = places.filter(place => place.name === stop.name && place.visitedAt === `2026-${month}-${date}`);
      assert.equal(matches.length,1,`Day ${day.number}: ${stop.name}`);
      if (stop.metro) assert.ok(matches[0].note.includes(stop.metro));
      if (stop.detail) assert.ok(matches[0].note.includes(stop.detail));
      if (/^\d{2}:\d{2}$/.test(stop.time)) assert.equal(matches[0].time,stop.time);
    }
  }
  assert.ok(trips[0].notes.includes('Day 7'));
  assert.ok(trips[1].places.some(place => place.name === 'Tianjin Eye'));
});

test('real destination pins highlight only Beijing and Tianjin; unspecified activities have no false pin', () => {
  const trips = createBeijingTianjinTrips();
  const visited = new Set(trips.flatMap(trip => Array.from(provincesForTrip(trip,shapes))));
  assert.deepEqual(Array.from(visited).sort(),['110000','120000']);
  const meal = trips[0].places.find(place => place.name === 'รับประทานอาหารกลางวัน');
  assert.equal(meal.latitude,undefined);
  assert.equal(meal.longitude,undefined);
  for (const trip of trips) {
    assert.equal(trip.expenses.length,0);
    assert.equal(trip.rating,undefined);
  }
});

test('merge preserves existing journeys, edits, photos, profile and source document', () => {
  const seed = createBeijingTianjinTrips();
  const edited = {...seed[0],name:'My edited itinerary',mediaIds:['my-photo'],notes:'My notes'};
  const oldTrip = {...seed[1],id:'unrelated',cityCode:'TOKYO',countryCode:'JP'};
  const source = {...empty(),trips:[edited,oldTrip]};
  const before = structuredClone(source);
  const merged = mergeBeijingPlan(source);
  assert.equal(merged.added,1);
  assert.deepEqual(plain(source),plain(before));
  assert.equal(merged.document.profile,source.profile);
  assert.equal(merged.document.trips[0],edited);
  assert.equal(merged.document.trips[1],oldTrip);
  assert.equal(mergeBeijingPlan(merged.document).added,0);
});

test('automatic addition writes once and does not recreate a subsequently deleted city trip', async () => {
  const f = await fixture();
  assert.equal(await f.store.addRequestedChinaPlan(),2);
  assert.equal(f.writes(),1);
  assert.equal(storage.get(BEIJING_PLAN_KEY),'added');
  f.document().trips = f.document().trips.filter(trip => trip.id !== TIANJIN_TRIP_ID);
  await f.store.reload();
  assert.equal(await f.store.addRequestedChinaPlan(),0);
  assert.equal(f.document().trips.length,1);
  assert.equal(f.writes(),1);
  assert.equal(await f.store.addRequestedChinaPlan(true),1);
  assert.equal(f.document().trips.length,2);
  assert.equal(f.store.stats().days,7);
});

test('simultaneous requests share one import and stable IDs prevent duplicates', async () => {
  const f = await fixture();
  const first = f.store.addRequestedChinaPlan();
  const second = f.store.addRequestedChinaPlan();
  assert.equal(first,second);
  await Promise.all([first,second]);
  assert.equal(f.writes(),1);
  assert.deepEqual(Array.from(f.store.trips(),trip => trip.id).sort(),[BEIJING_TRIP_ID,TIANJIN_TRIP_ID].sort());
});

test('failed storage does not set the once-only marker and a retry succeeds', async () => {
  const f = await fixture();
  const replace = repository.replaceDocument;
  repository.replaceDocument = async () => { throw new Error('Storage full'); };
  await assert.rejects(f.store.addRequestedChinaPlan(),/Storage full/);
  assert.equal(storage.has(BEIJING_PLAN_KEY),false);
  assert.equal(f.store.trips().length,0);
  repository.replaceDocument = replace;
  assert.equal(await f.store.addRequestedChinaPlan(),2);
});
