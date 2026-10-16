import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync('src/app/shared/atlas-map/atlas-map.ts','utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true },
}).outputText;
function fixture() {
  const exports = {};
  const decorator = () => () => {};
  class EventEmitter { emitted=[]; emit(value) { this.emitted.push(value); } }
  class DOMPoint { constructor(x,y) { this.x=x;this.y=y; } }
  vm.runInNewContext(source, { exports, DOMPoint,
    require: name => name === '@angular/core'
      ? { Component:decorator,ViewChild:decorator,Input:decorator,Output:decorator,EventEmitter }
      : name === 'maplibre-gl' ? {} : { ASIA_CONTINENT:{code:'AS'},ASIA_COUNTRIES:[] },
  });
  const component = new exports.AtlasMap();
  const handlers = new Map(); const canvas={style:{cursor:''}};
  component.map = {
    on(name,handler) { assert.equal(typeof handler,'function','Events must not depend on a loaded feature layer'); handlers.set(name,handler); },
    getCanvas:()=>canvas, isMoving:()=>false,
    getLayer:()=>undefined,
    queryRenderedFeatures:()=>{throw Error('SVG selection should not query a missing GL layer');},
  };
  component.bindMapEvents();
  return { component, handlers, canvas };
}
function geography(f) {
  f.component.atlasData={type:'FeatureCollection',features:[
    {properties:{code:'CN',name:'China'}}, {properties:{code:'TH',name:'Thailand'}},
  ]};
  f.component.overlayPaths.set('CN',{isPointInFill:p=>p.x>=100&&p.x<=300&&p.y>=50&&p.y<=200});
  f.component.overlayPaths.set('TH',{isPointInFill:p=>p.x>=180&&p.x<=220&&p.y>=250&&p.y<=300});
}
test('visible China can be clicked before the invisible MapLibre layer exists',()=>{
  const f=fixture();
  f.handlers.get('click')({point:{x:150,y:120}});
  assert.equal(f.component.countrySelected.emitted.length,0,'No country is selected before geography loads');
  geography(f);
  f.handlers.get('click')({point:{x:150,y:120}});
  assert.deepEqual(f.component.countrySelected.emitted,['CN']);
});
test('clicking another country or ocean selects the visible country only',()=>{
  const f=fixture(); geography(f);
  f.handlers.get('click')({point:{x:200,y:270}});
  f.handlers.get('click')({point:{x:400,y:400}});
  assert.deepEqual(f.component.countrySelected.emitted,['TH']);
});
test('selection follows the updated projected paths after dragging the map',()=>{
  const f=fixture(); geography(f);
  f.component.overlayPaths.set('CN',{isPointInFill:p=>p.x>=500&&p.x<=700&&p.y>=50&&p.y<=200});
  f.handlers.get('click')({point:{x:150,y:120}});
  assert.equal(f.component.countrySelected.emitted.length,0);
  f.handlers.get('click')({point:{x:550,y:120}});
  assert.deepEqual(f.component.countrySelected.emitted,['CN']);
});
test('hover and leaving the map update the pointer without selecting a country',()=>{
  const f=fixture(); geography(f);
  let hovered;
  f.component.showCountryPopup=(_event,feature)=>{hovered=feature.properties.code;f.canvas.style.cursor='pointer';};
  f.handlers.get('mousemove')({point:{x:150,y:120}});
  assert.equal(hovered,'CN'); assert.equal(f.canvas.style.cursor,'pointer');
  f.handlers.get('mouseout')();
  assert.equal(f.canvas.style.cursor,'');
  assert.equal(f.component.countrySelected.emitted.length,0);
});
