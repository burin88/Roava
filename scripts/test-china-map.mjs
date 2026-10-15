import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

// Run the pure application resolver against the real generated boundaries.
const exports = {};
const compiled = ts.transpileModule(fs.readFileSync('src/app/core/data/china-provinces.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(compiled, { exports });
const { CHINA_PROVINCES, provinceAtCoordinates, primaryProvinceForTrip, provincesForTrip } = exports;
const shapes = JSON.parse(fs.readFileSync('public/assets/maps/china/provinces.json', 'utf8')).provinces;
const trip = overrides => ({ countryCode: 'CN', cityCode: '', places: [], ...overrides });
const sorted = result => Array.from(result).sort();

test('every provincial capital matches its actual boundary; paths and labels are usable', () => {
  assert.equal(shapes.length, 31);
  assert.equal(new Set(shapes.map(shape => shape.code)).size, 31);
  assert.deepEqual(shapes.map(shape => shape.code).sort(), Array.from(CHINA_PROVINCES, province => province.code).sort());
  for (const province of CHINA_PROVINCES) {
    assert.equal(provinceAtCoordinates(...province.coordinates, shapes), province.code, province.name);
    const shape = shapes.find(item => item.code === province.code);
    assert.ok(shape.path.startsWith('M') && !/NaN|Infinity/.test(shape.path));
    assert.ok(shape.label.every(Number.isFinite));
    assert.ok(shape.bounds[1][0] > shape.bounds[0][0] && shape.bounds[1][1] > shape.bounds[0][1]);
  }
});

test('existing Chinese city codes resolve without migrating saved trips', () => {
  for (const [cityCode, provinceCode] of Object.entries({
    BEIJING: '110000', SHANGHAI: '310000', GUANGZHOU: '440000', CHENGDU: '510000', KUNMING: '530000', TIANJIN: '120000',
  })) assert.deepEqual(sorted(provincesForTrip(trip({ cityCode }), shapes)), [provinceCode]);
  assert.equal(primaryProvinceForTrip(trip({ cityName: "Xi'an" })), '610000');
  assert.equal(primaryProvinceForTrip(trip({ cityName: 'ปักกิ่ง' })), '110000');
});

test('projection draws local regions rather than the globe complement', () => {
  const beijing = shapes.find(shape => shape.code === '110000');
  const xinjiang = shapes.find(shape => shape.code === '650000');
  const width = shape => shape.bounds[1][0] - shape.bounds[0][0];
  assert.ok(width(beijing) < 100, 'Beijing should not span the whole map');
  assert.ok(width(xinjiang) > width(beijing) * 5, 'province bounds should reflect their relative size');
  for (const shape of shapes) {
    const [[x1,y1],[x2,y2]] = shape.bounds;
    assert.ok(x1 >= 0 && y1 >= 0 && x2 <= 1000 && y2 <= 670);
  }
});

test('a Beijing journey with a recorded Tianjin stop highlights both regions, once each', () => {
  const journey = trip({ cityCode: 'BEIJING', places: [
    { longitude: 116.3972, latitude: 39.9163 },
    { longitude: 117.2008, latitude: 39.0842 },
    { longitude: 117.2008, latitude: 39.0842 },
  ] });
  assert.deepEqual(sorted(provincesForTrip(journey, shapes)), ['110000', '120000']);
});

test('custom cities use explicit province; invalid province codes do not hide known city matches', () => {
  assert.deepEqual(sorted(provincesForTrip(trip({ cityCode: 'MY_VILLAGE', provinceCode: '530000' }), shapes)), ['530000']);
  assert.equal(primaryProvinceForTrip(trip({ cityCode: 'BEIJING', provinceCode: 'INVALID' })), '110000');
  assert.deepEqual(sorted(provincesForTrip(trip({ cityCode: 'UNKNOWN' }), shapes)), []);
});

test('foreign journeys and coordinates outside the regions do not mark China as visited', () => {
  assert.deepEqual(sorted(provincesForTrip(trip({ countryCode: 'TW', cityCode: 'TAIPEI', provinceCode: '110000' }), shapes)), []);
  for (const coordinates of [[100.5,13.75], [121.5654,25.033], [0,0], [NaN,39], [116,Infinity], [200,30]]) {
    assert.equal(provinceAtCoordinates(...coordinates, shapes), undefined);
  }
});

test('polygon holes and disjoint islands are respected', () => {
  const shape = { code:'test', geometry: { type:'MultiPolygon', coordinates: [
    [[[0,0],[10,0],[10,10],[0,10],[0,0]], [[3,3],[7,3],[7,7],[3,7],[3,3]]],
    [[[20,20],[22,20],[22,22],[20,22],[20,20]]],
  ] } };
  assert.equal(provinceAtCoordinates(1,1,[shape]), 'test');
  assert.equal(provinceAtCoordinates(5,5,[shape]), undefined);
  assert.equal(provinceAtCoordinates(21,21,[shape]), 'test');
});

test('editing/removing a destination removes its old provincial highlight', () => {
  const journey = trip({ cityCode: 'BEIJING' });
  assert.deepEqual(sorted(provincesForTrip(journey, shapes)), ['110000']);
  journey.cityCode = 'CHENGDU';
  assert.deepEqual(sorted(provincesForTrip(journey, shapes)), ['510000']);
  journey.countryCode = 'TH';
  assert.deepEqual(sorted(provincesForTrip(journey, shapes)), []);
});

// Exercise the actual form controller without a DOM; only Angular decorators
// and event delivery are replaced. Catalog and province inference remain real.
const moduleCache = new Map();
const loadControllerModule = file => {
  if (moduleCache.has(file)) return moduleCache.get(file);
  const moduleExports = {};
  moduleCache.set(file, moduleExports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true },
  }).outputText;
  const requireModule = name => {
    if (name === '@angular/core') return {
      Component: () => target => target, Input: () => () => {}, Output: () => () => {},
      EventEmitter: class { emit(value) { this.value = value; } },
    };
    if (name === '@angular/common') return { CommonModule: class {} };
    if (name === '@angular/forms') return { FormsModule: class {} };
    return loadControllerModule(path.resolve(path.dirname(file), `${name}.ts`));
  };
  vm.runInNewContext(code, { exports: moduleExports, require: requireModule, crypto: webcrypto, structuredClone });
  return moduleExports;
};
const { TripEditor } = loadControllerModule(path.resolve('src/app/features/trips/trip-editor/trip-editor.ts'));
const chinaEditor = () => { const editor = new TripEditor(); editor.presetCountryCode = 'CN'; editor.ngOnChanges(); return editor; };

test('a new unknown city does not inherit the default Beijing highlight', () => {
  const editor = chinaEditor();
  assert.equal(editor.model.provinceCode, '110000');
  editor.cityText = 'A village not in the catalog';
  editor.updateCityProvince();
  assert.equal(editor.model.provinceCode, undefined);
  editor.submit();
  assert.equal(editor.saved.value.provinceCode, undefined);
});

test('manual province assignment survives a custom city and Unicode city names remain distinct', () => {
  const editor = chinaEditor();
  editor.model.provinceCode = '530000';
  editor.selectProvince();
  editor.cityText = 'หมู่บ้านในยูนนาน';
  editor.updateCityProvince();
  editor.submit();
  assert.equal(editor.saved.value.provinceCode, '530000');
  assert.equal(editor.saved.value.cityCode, 'หมู่บ้านในยูนนาน');
  assert.equal(editor.saved.value.cityName, 'หมู่บ้านในยูนนาน');
});

test('editing an older trip infers province without mutating the saved input', () => {
  const editor = chinaEditor();
  const original = structuredClone(editor.model);
  delete original.provinceCode;
  editor.trip = original;
  editor.ngOnChanges();
  assert.equal(editor.model.provinceCode, '110000');
  assert.equal(original.provinceCode, undefined);
  editor.cityText = 'Chengdu';
  editor.updateCityProvince();
  editor.submit();
  assert.equal(editor.saved.value.provinceCode, '510000');
  assert.equal(editor.saved.value.cityCode, 'CHENGDU');
});
