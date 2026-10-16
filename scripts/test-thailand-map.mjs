import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const cache=new Map();
function load(file) {
  file=path.resolve(file); if(cache.has(file))return cache.get(file);
  const exports={};cache.set(file,exports);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;
  vm.runInNewContext(code,{exports,crypto:webcrypto,structuredClone,require:name=>{
    if(name==='@angular/core')return {Component:()=>target=>target,Input:()=>()=>{},Output:()=>()=>{},EventEmitter:class{emit(v){this.value=v;}}};
    if(name==='@angular/common'||name==='@angular/forms')return {};
    return load(path.resolve(path.dirname(file),name+'.ts'));
  }});return exports;
}
const {THAILAND_PROVINCES,thaiProvinceByCode,thaiProvinceForCity,primaryThaiProvinceForTrip,thaiProvincesForTrip}=load('src/app/core/data/thailand-provinces.ts');
const {provinceAtCoordinates}=load('src/app/core/data/china-provinces.ts');
const {TripEditor}=load('src/app/features/trips/trip-editor/trip-editor.ts');
const shapes=JSON.parse(fs.readFileSync('public/assets/maps/thailand/provinces.json','utf8')).provinces;
const trip=overrides=>({countryCode:'TH',cityCode:'',places:[],...overrides});
const sorted=set=>Array.from(set).sort();

test('all 77 official province codes have real geometry, bilingual names and usable interior anchors',()=>{
  assert.equal(THAILAND_PROVINCES.length,77); assert.equal(shapes.length,77);
  assert.equal(new Set(shapes.map(p=>p.code)).size,77);
  for(const p of THAILAND_PROVINCES){
    const shape=shapes.find(s=>s.code===p.code);assert.ok(shape,p.code);
    assert.match(p.code,/^TH-\d{2}$/);assert.ok(p.name&&p.thaiName);
    assert.equal(provinceAtCoordinates(...p.coordinates,shapes),p.code,p.name);
    assert.ok(shape.path.startsWith('M')&&!/NaN|Infinity/.test(shape.path));
    const [[x1,y1],[x2,y2]]=shape.bounds;
    assert.ok(x1>=0&&y1>=0&&x2<=1000&&y2<=670&&x2>x1&&y2>y1,p.name);
  }
  assert.equal(thaiProvinceByCode('TH-10').thaiName,'กรุงเทพมหานคร');
  assert.equal(thaiProvinceByCode('TH-38').thaiName,'บึงกาฬ');
});
test('existing destinations and Thai/English aliases resolve without changing saved city IDs',()=>{
  for(const [name,code]of Object.entries({BANGKOK:'TH-10',CHIANG_MAI:'TH-50',PHUKET:'TH-83',กรุงเทพ:'TH-10',
    กรุงเทพมหานคร:'TH-10',บึงกาฬ:'TH-38','จังหวัดเชียงราย':'TH-57',พัทยา:'TH-20','Hua Hin':'TH-77',หาดใหญ่:'TH-90'})){
    assert.equal(thaiProvinceForCity(name),code,name);
  }
  assert.equal(primaryThaiProvinceForTrip(trip({cityCode:'PHUKET',provinceCode:'83'})),'TH-83');
});
test('multi-stop journeys highlight every recorded province once and ignore foreign trips',()=>{
  const journey=trip({cityCode:'BANGKOK',places:[{longitude:98.9853,latitude:18.7883},{longitude:98.3381,latitude:7.8804},{longitude:98.3381,latitude:7.8804}]});
  assert.deepEqual(sorted(thaiProvincesForTrip(journey,shapes)),['TH-10','TH-50','TH-83']);
  assert.deepEqual(sorted(thaiProvincesForTrip({...journey,countryCode:'CN'},shapes)),[]);
  assert.equal(provinceAtCoordinates(116.4074,39.9042,shapes),undefined);
});
test('province selection in the editor can add a journey for every Thai province',()=>{
  for(const p of THAILAND_PROVINCES){
    const editor=new TripEditor();editor.presetCountryCode='TH';editor.presetCityCode=p.capitalCode;editor.presetProvinceCode=p.code;editor.ngOnChanges();
    assert.equal(editor.availableProvinces.length,77);
    editor.submit();assert.equal(editor.saved.value.provinceCode,p.code,p.name);
    assert.equal(editor.saved.value.cityCode,p.capitalCode,p.name);
  }
});
test('manual custom destination retains its province and switching countries clears Thai province',()=>{
  const editor=new TripEditor();editor.presetCountryCode='TH';editor.ngOnChanges();
  editor.model.provinceCode='TH-38';editor.selectProvince();editor.cityText='หมู่บ้านริมโขง';editor.updateCityProvince();editor.submit();
  assert.equal(editor.saved.value.provinceCode,'TH-38');assert.equal(editor.saved.value.cityCode,'หมู่บ้านริมโขง');
  const {countryByCode}=load('src/app/core/data/asia-catalog.ts');editor.selectCountry(countryByCode('JP'));editor.submit();
  assert.equal(editor.saved.value.provinceCode,undefined);
});
test('editing old Thai trips infers province without mutating input or inventing visits for unknown cities',()=>{
  const editor=new TripEditor();editor.presetCountryCode='TH';editor.ngOnChanges();
  const old=structuredClone(editor.model);old.cityCode='CHIANG_MAI';delete old.provinceCode;editor.trip=old;editor.ngOnChanges();
  assert.equal(editor.model.provinceCode,'TH-50');assert.equal(old.provinceCode,undefined);
  editor.cityText='Unknown destination';editor.updateCityProvince();assert.equal(editor.model.provinceCode,undefined);
});
test('map and dropdown country selection both open the Thailand province route',()=>{
  const exports={};const file='src/app/features/dashboard/asia-dashboard/asia-dashboard.ts';
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;
  vm.runInNewContext(code,{exports,require:name=>name==='@angular/core'?{Component:()=>target=>target}:{}});
  const calls=[];const instance=Object.create(exports.AsiaDashboard.prototype);instance.router={navigate:args=>calls.push(Array.from(args))};
  instance.selectCountry('TH');instance.selectCountryFromSearch('TH');
  assert.deepEqual(calls,[['/country','TH'],['/country','TH']]);
});
